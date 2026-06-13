import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { UserEntity } from '../database/entities/user.entity';
import {
  OrganizationMemberEntity,
  RoleAssignmentEntity,
  RoleEntity,
} from '../database/entities/auth.entity';

describe('AuthService', () => {
  let service: AuthService;

  const usersRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const roleAssignmentsRepository = { find: jest.fn() };
  const rolesRepository = {
    createQueryBuilder: jest.fn(),
  };
  const orgMembersRepository = { findOne: jest.fn() };
  const jwtService = { signAsync: jest.fn().mockResolvedValue('token') };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(UserEntity), useValue: usersRepository },
        {
          provide: getRepositoryToken(RoleAssignmentEntity),
          useValue: roleAssignmentsRepository,
        },
        { provide: getRepositoryToken(RoleEntity), useValue: rolesRepository },
        {
          provide: getRepositoryToken(OrganizationMemberEntity),
          useValue: orgMembersRepository,
        },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get(AuthService);
    jest.clearAllMocks();
  });

  it('throws when user not found', async () => {
    usersRepository.findOne.mockResolvedValue(null);

    await expect(
      service.login({ email: 'missing@test.local', password: 'secret' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
