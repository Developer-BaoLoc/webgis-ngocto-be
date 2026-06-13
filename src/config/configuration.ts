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
    password: process.env.DATABASE_PASSWORD ?? '',
  },
});

export type AppConfig = ReturnType<typeof import('./configuration').default>;
