export default () => ({
  port: parseInt(process.env.PORT ?? '4000', 10),
  apiPublicUrl: process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? '4000'}`,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  ward: {
    name: process.env.WARD_NAME ?? 'Long Bình',
    code: process.env.WARD_CODE ?? 'long-binh',
    district: process.env.WARD_DISTRICT ?? 'Cái Răng',
    province: process.env.WARD_PROVINCE ?? 'Cần Thơ',
    country: 'Việt Nam',
    defaultZoom: parseInt(process.env.WARD_DEFAULT_ZOOM ?? '13', 10),
    center: {
      lat: parseFloat(process.env.WARD_CENTER_LAT ?? '10.0125'),
      lng: parseFloat(process.env.WARD_CENTER_LNG ?? '105.785'),
    },
    boundary: {
      datasetFile: process.env.WARD_BOUNDARY_DATASET ?? 'can-tho.geojson',
      matchProperty: process.env.WARD_BOUNDARY_MATCH_PROPERTY ?? 'ten_xa',
      matchValue: process.env.WARD_BOUNDARY_MATCH_VALUE ?? process.env.WARD_NAME ?? 'Long Bình',
      adminCodeProperty: process.env.WARD_BOUNDARY_ADMIN_CODE_PROPERTY ?? 'ma_xa',
      adminCode: process.env.WARD_BOUNDARY_ADMIN_CODE ?? '31473',
    },
  },
  database: {
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: parseInt(process.env.DATABASE_PORT ?? '5434', 10),
    name: process.env.DATABASE_NAME ?? 'gis_longbinh',
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
    bucket: process.env.MINIO_BUCKET ?? 'gis-longbinh',
    useSSL: process.env.MINIO_USE_SSL === 'true',
  },
});

export type AppConfig = ReturnType<typeof import('./configuration').default>;
