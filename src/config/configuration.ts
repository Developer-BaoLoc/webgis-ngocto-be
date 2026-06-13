export default () => ({
  port: parseInt(process.env.PORT ?? '4000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  ward: {
    name: 'Long Bình',
    code: 'long-binh',
    district: 'Cái Răng',
    province: 'Cần Thơ',
    country: 'Việt Nam',
    // Tọa độ trung tâm phường (sẽ hiệu chỉnh khi có dữ liệu chính thức)
    center: {
      lat: 10.0125,
      lng: 105.785,
    },
    defaultZoom: 14,
  },
  database: {
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: parseInt(process.env.DATABASE_PORT ?? '5434', 10),
    name: process.env.DATABASE_NAME ?? 'gis_longbinh',
    user: process.env.DATABASE_USER ?? 'postgres',
    password: process.env.DATABASE_PASSWORD ?? 'postgres',
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
});

export type AppConfig = ReturnType<typeof import('./configuration').default>;
