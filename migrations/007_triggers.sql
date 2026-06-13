-- 007_triggers.sql
-- GIS Long Bình v3.2 — Validation triggers

BEGIN;

-- ---------------------------------------------------------------------------
-- Geometry: cache area (m²)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_feature_geometry_area()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.geometry IS NULL THEN
        NEW.geometry_area_m2 = NULL;
    ELSE
        NEW.geometry_area_m2 = ST_Area(NEW.geometry::geography);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_features_geometry_area
    BEFORE INSERT OR UPDATE OF geometry ON features
    FOR EACH ROW EXECUTE FUNCTION update_feature_geometry_area();

-- ---------------------------------------------------------------------------
-- Geometry: validate type, SRID, validity
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION geometry_matches_kind(
    geom GEOMETRY,
    expected geometry_kind
)
RETURNS BOOLEAN AS $$
DECLARE
    gtype TEXT;
BEGIN
    IF geom IS NULL THEN
        RETURN TRUE;
    END IF;

    gtype := GeometryType(geom);

    CASE expected
        WHEN 'none' THEN RETURN FALSE;
        WHEN 'point' THEN RETURN gtype = 'POINT';
        WHEN 'multipoint' THEN RETURN gtype IN ('POINT', 'MULTIPOINT');
        WHEN 'linestring' THEN RETURN gtype = 'LINESTRING';
        WHEN 'multilinestring' THEN RETURN gtype IN ('LINESTRING', 'MULTILINESTRING');
        WHEN 'polygon' THEN RETURN gtype = 'POLYGON';
        WHEN 'multipolygon' THEN RETURN gtype IN ('POLYGON', 'MULTIPOLYGON');
        ELSE RETURN FALSE;
    END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION validate_feature_geometry()
RETURNS TRIGGER AS $$
DECLARE
    expected_kind geometry_kind;
    is_required BOOLEAN;
BEGIN
    SELECT geometry_kind, geometry_required
    INTO expected_kind, is_required
    FROM layers
    WHERE id = NEW.layer_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Layer % not found for feature', NEW.layer_id;
    END IF;

    IF NEW.geometry IS NULL THEN
        IF is_required AND NEW.status IN ('published', 'approved') THEN
            RAISE EXCEPTION 'Geometry is required for published/approved features on layer %', NEW.layer_id;
        END IF;
        RETURN NEW;
    END IF;

    IF expected_kind = 'none' THEN
        RAISE EXCEPTION 'Layer % does not accept geometry', NEW.layer_id;
    END IF;

    IF ST_SRID(NEW.geometry) <> 4326 THEN
        RAISE EXCEPTION 'Geometry must use EPSG:4326, got SRID %', ST_SRID(NEW.geometry);
    END IF;

    IF ST_IsEmpty(NEW.geometry) THEN
        RAISE EXCEPTION 'Geometry cannot be empty';
    END IF;

    IF NOT ST_IsValid(NEW.geometry) THEN
        RAISE EXCEPTION 'Invalid geometry: %', ST_IsValidReason(NEW.geometry);
    END IF;

    IF NOT geometry_matches_kind(NEW.geometry, expected_kind) THEN
        RAISE EXCEPTION 'Geometry type % does not match layer geometry_kind %',
            GeometryType(NEW.geometry), expected_kind;
    END IF;

    IF expected_kind IN ('polygon', 'multipolygon') THEN
        NEW.geometry := ST_Multi(ST_CollectionExtract(ST_MakeValid(NEW.geometry), 3));
    END IF;

    IF NEW.geometry IS NOT NULL AND NEW.location_status = 'unlocated' THEN
        NEW.location_status := 'located';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_features_validate_geometry
    BEFORE INSERT OR UPDATE OF geometry, status, layer_id ON features
    FOR EACH ROW EXECUTE FUNCTION validate_feature_geometry();

-- ---------------------------------------------------------------------------
-- Relations: validate source/target layers match definition
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION validate_feature_relation_layers()
RETURNS TRIGGER AS $$
DECLARE
    def_source_layer UUID;
    def_target_layer UUID;
    src_layer UUID;
    tgt_layer UUID;
    src_tenant UUID;
    tgt_tenant UUID;
BEGIN
    SELECT source_layer_id, target_layer_id
    INTO def_source_layer, def_target_layer
    FROM relation_definitions
    WHERE id = NEW.relation_definition_id;

    SELECT layer_id, tenant_id INTO src_layer, src_tenant
    FROM features WHERE id = NEW.source_feature_id;

    SELECT layer_id, tenant_id INTO tgt_layer, tgt_tenant
    FROM features WHERE id = NEW.target_feature_id;

    IF src_layer IS NULL OR tgt_layer IS NULL THEN
        RAISE EXCEPTION 'Source or target feature not found';
    END IF;

    IF src_layer <> def_source_layer OR tgt_layer <> def_target_layer THEN
        RAISE EXCEPTION 'Feature layers do not match relation definition (expected % -> %, got % -> %)',
            def_source_layer, def_target_layer, src_layer, tgt_layer;
    END IF;

    IF src_tenant <> NEW.tenant_id OR tgt_tenant <> NEW.tenant_id THEN
        RAISE EXCEPTION 'Cross-tenant relation is not allowed';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_feature_relations_validate_layers
    BEFORE INSERT OR UPDATE ON feature_relations
    FOR EACH ROW EXECUTE FUNCTION validate_feature_relation_layers();

-- ---------------------------------------------------------------------------
-- Relations: enforce cardinality (one_to_one, one_to_many)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION enforce_relation_cardinality()
RETURNS TRIGGER AS $$
DECLARE
    card relation_cardinality;
BEGIN
    SELECT cardinality INTO card
    FROM relation_definitions
    WHERE id = NEW.relation_definition_id;

    IF card = 'one_to_one' THEN
        IF EXISTS (
            SELECT 1 FROM feature_relations fr
            WHERE fr.relation_definition_id = NEW.relation_definition_id
              AND fr.source_feature_id = NEW.source_feature_id
              AND fr.id IS DISTINCT FROM NEW.id
        ) THEN
            RAISE EXCEPTION 'one_to_one violation: source already linked';
        END IF;
        IF EXISTS (
            SELECT 1 FROM feature_relations fr
            WHERE fr.relation_definition_id = NEW.relation_definition_id
              AND fr.target_feature_id = NEW.target_feature_id
              AND fr.id IS DISTINCT FROM NEW.id
        ) THEN
            RAISE EXCEPTION 'one_to_one violation: target already linked';
        END IF;
    ELSIF card = 'one_to_many' THEN
        IF EXISTS (
            SELECT 1 FROM feature_relations fr
            WHERE fr.relation_definition_id = NEW.relation_definition_id
              AND fr.target_feature_id = NEW.target_feature_id
              AND fr.id IS DISTINCT FROM NEW.id
        ) THEN
            RAISE EXCEPTION 'one_to_many violation: target already linked to another source';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_feature_relations_cardinality
    BEFORE INSERT OR UPDATE ON feature_relations
    FOR EACH ROW EXECUTE FUNCTION enforce_relation_cardinality();

-- ---------------------------------------------------------------------------
-- Analytics: metric/dimension field must belong to dataset source layer
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION validate_metric_field_layer()
RETURNS TRIGGER AS $$
DECLARE
    source_layer UUID;
    field_layer UUID;
BEGIN
    IF NEW.field_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT source_layer_id INTO source_layer FROM datasets WHERE id = NEW.dataset_id;
    SELECT layer_id INTO field_layer FROM fields WHERE id = NEW.field_id;

    IF source_layer <> field_layer THEN
        RAISE EXCEPTION 'Metric field % does not belong to dataset source layer', NEW.field_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_dimension_field_layer()
RETURNS TRIGGER AS $$
DECLARE
    source_layer UUID;
    field_layer UUID;
BEGIN
    IF NEW.field_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT source_layer_id INTO source_layer FROM datasets WHERE id = NEW.dataset_id;
    SELECT layer_id INTO field_layer FROM fields WHERE id = NEW.field_id;

    IF source_layer <> field_layer THEN
        RAISE EXCEPTION 'Dimension field % does not belong to dataset source layer', NEW.field_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_metrics_validate_field
    BEFORE INSERT OR UPDATE ON metrics
    FOR EACH ROW EXECUTE FUNCTION validate_metric_field_layer();

CREATE TRIGGER trg_dimensions_validate_field
    BEFORE INSERT OR UPDATE ON dimensions
    FOR EACH ROW EXECUTE FUNCTION validate_dimension_field_layer();

-- ---------------------------------------------------------------------------
-- Sync tenant_id on child rows from parent feature
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION sync_feature_admin_unit_tenant()
RETURNS TRIGGER AS $$
BEGIN
    SELECT tenant_id INTO NEW.tenant_id
    FROM features WHERE id = NEW.feature_id;

    IF NEW.tenant_id IS NULL THEN
        RAISE EXCEPTION 'Feature % not found', NEW.feature_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_feature_admin_units_sync_tenant
    BEFORE INSERT OR UPDATE ON feature_administrative_units
    FOR EACH ROW EXECUTE FUNCTION sync_feature_admin_unit_tenant();

COMMIT;
