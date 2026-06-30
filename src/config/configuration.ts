const defaultWardName = process.env.WARD_NAME ?? 'Ngọc Tố';
const defaultWardLabel = process.env.WARD_LABEL ?? `Xã ${defaultWardName}`;
const defaultWardProvince = process.env.WARD_PROVINCE ?? 'Cần Thơ';
const defaultProjectName =
  process.env.PROJECT_DISPLAY_NAME ?? `GIS ${defaultWardName}`;

const dangerousJwtSecrets = new Set([
  '',
  'change-me',
  'change-me-in-production',
  'default',
  'secret',
  'jwt-secret',
]);

export function validateProductionConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  if (env.NODE_ENV !== 'production') return [];

  const warnings: string[] = [];
  const jwtSecret = (env.JWT_SECRET ?? '').trim();
  if (dangerousJwtSecrets.has(jwtSecret.toLowerCase())) {
    throw new Error(
      'Invalid production configuration: JWT_SECRET must be set to a strong non-default value.',
    );
  }

  if ((env.DATABASE_PASSWORD ?? 'postgres') === 'postgres') {
    warnings.push(
      'DATABASE_PASSWORD is using the local development default "postgres". Verify production database credentials.',
    );
  }

  if (
    (env.MINIO_ACCESS_KEY ?? 'minioadmin') === 'minioadmin' ||
    (env.MINIO_SECRET_KEY ?? 'minioadmin') === 'minioadmin'
  ) {
    warnings.push(
      'MINIO_ACCESS_KEY/MINIO_SECRET_KEY are using local development defaults. Verify production object storage credentials.',
    );
  }

  if ((env.DATABASE_NAME ?? 'gis_ngocto') === 'gis_ngocto') {
    warnings.push(
      'DATABASE_NAME is still the Ngoc To development default. Verify the target production database.',
    );
  }

  return warnings;
}

export default () => ({
  port: parseInt(process.env.PORT ?? '4000', 10),
  apiPublicUrl:
    process.env.API_PUBLIC_URL ??
    `http://localhost:${process.env.PORT ?? '4000'}`,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  project: {
    displayName: defaultProjectName,
    apiDisplayName:
      process.env.PROJECT_API_DISPLAY_NAME ?? `${defaultProjectName} API`,
    description:
      process.env.PROJECT_DESCRIPTION ??
      `Hệ thống thông tin địa lý ${defaultWardLabel}, ${defaultWardProvince}`,
  },
  ward: {
    name: defaultWardName,
    label: defaultWardLabel,
    locationLabel: defaultWardLabel,
    code: process.env.WARD_CODE ?? 'ngoc-to',
    district: process.env.WARD_DISTRICT ?? 'Mỹ Xuyên',
    province: defaultWardProvince,
    country: process.env.WARD_COUNTRY ?? 'Việt Nam',
    defaultZoom: parseInt(process.env.WARD_DEFAULT_ZOOM ?? '13', 10),
    center: {
      lat: parseFloat(process.env.WARD_CENTER_LAT ?? '9.4466'),
      lng: parseFloat(process.env.WARD_CENTER_LNG ?? '105.9342'),
    },
    boundary: {
      datasetFile: process.env.WARD_BOUNDARY_DATASET ?? 'can-tho.geojson',
      matchProperty: process.env.WARD_BOUNDARY_MATCH_PROPERTY ?? 'ten_xa',
      matchValue:
        process.env.WARD_BOUNDARY_MATCH_VALUE ??
        process.env.WARD_NAME ??
        defaultWardName,
      adminCodeProperty:
        process.env.WARD_BOUNDARY_ADMIN_CODE_PROPERTY ?? 'ma_xa',
      adminCode: process.env.WARD_BOUNDARY_ADMIN_CODE ?? '31723',
    },
  },
  database: {
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: parseInt(process.env.DATABASE_PORT ?? '5435', 10),
    name: process.env.DATABASE_NAME ?? 'gis_ngocto',
    user: process.env.DATABASE_USER ?? 'postgres',
    password: process.env.DATABASE_PASSWORD ?? 'postgres',
    logging: process.env.DATABASE_LOGGING === 'true',
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'change-me-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
  tenant: {
    defaultId:
      process.env.DEFAULT_TENANT_ID ?? 'a0000000-0000-4000-8000-000000000001',
  },
  minio: {
    endpoint: process.env.MINIO_ENDPOINT ?? 'localhost',
    port: parseInt(process.env.MINIO_PORT ?? '9000', 10),
    accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
    bucket: process.env.MINIO_BUCKET ?? 'gis-ngocto',
    useSSL: process.env.MINIO_USE_SSL === 'true',
  },
});

export type AppConfig = ReturnType<typeof import('./configuration').default>;
