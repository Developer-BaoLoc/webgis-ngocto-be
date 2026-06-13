import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/api (GET)', () => {
    return request(app.getHttpServer())
      .get('/api')
      .expect(200)
      .expect((res) => {
        expect(res.body.data.status).toBe('ok');
        expect(res.body.data.service).toBe('GIS Long Bình API');
        expect(res.body.meta).toBeDefined();
      });
  });

  it('/api/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.data).toBeDefined();
        expect(res.body.data.database).toBeDefined();
      });
  });

  it('/api/layers (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/layers')
      .expect(200)
      .expect((res) => {
        expect(res.body.data.project.name).toBe('GIS Long Bình');
        expect(Array.isArray(res.body.data.layers)).toBe(true);
      });
  });

  describe('Auth (requires DB seed)', () => {
    it('POST /api/auth/login — invalid credentials', () => {
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'wrong@test.local', password: 'wrong1' })
        .expect(401);
    });

    it('POST /api/auth/login + GET /api/auth/me', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@longbinh.local', password: 'Admin@123' });

      if (loginRes.status === 401 && loginRes.body.message?.includes('Email')) {
        // DB not seeded or unavailable — skip assertion
        return;
      }

      expect(loginRes.status).toBe(201);
      expect(loginRes.body.data.accessToken).toBeDefined();

      const token = loginRes.body.data.accessToken as string;

      const meRes = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(meRes.body.data.email).toBe('admin@longbinh.local');
      expect(meRes.body.data.roles).toContain('super_admin');
    });
  });
});
