import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { compare } from 'bcrypt';
import { Repository } from 'typeorm';
import { UserEntity } from '../database/entities/user.entity';
import {
  OrganizationMemberEntity,
  RoleAssignmentEntity,
  RoleEntity,
} from '../database/entities/auth.entity';
import { JwtPayload, AuthenticatedUser } from '../common/types/api.types';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(RoleAssignmentEntity)
    private readonly roleAssignmentsRepository: Repository<RoleAssignmentEntity>,
    @InjectRepository(RoleEntity)
    private readonly rolesRepository: Repository<RoleEntity>,
    @InjectRepository(OrganizationMemberEntity)
    private readonly orgMembersRepository: Repository<OrganizationMemberEntity>,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.usersRepository.findOne({
      where: { email: dto.email.toLowerCase(), isActive: true },
    });

    if (!user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    const passwordValid = await compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    await this.usersRepository.update(user.id, { lastLoginAt: new Date() });

    const roles = await this.loadRoleCodes(user.id, user.tenantId);
    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.parseExpiresInSeconds(),
      user: this.toUserProfile(user, roles),
    };
  }

  async getProfile(
    userId: string,
    tenantId: string,
  ): Promise<AuthenticatedUser> {
    const user = await this.usersRepository.findOne({
      where: { id: userId, tenantId, isActive: true },
    });

    if (!user) {
      throw new UnauthorizedException('User không tồn tại');
    }

    const roles = await this.loadRoleCodes(user.id, user.tenantId);
    return this.toUserProfile(user, roles);
  }

  async getPrimaryOrganizationId(userId: string, tenantId: string) {
    const member = await this.orgMembersRepository.findOne({
      where: { userId, tenantId, isPrimary: true },
    });
    return member?.organizationId ?? null;
  }

  private async loadRoleCodes(
    userId: string,
    tenantId: string,
  ): Promise<string[]> {
    const assignments = await this.roleAssignmentsRepository.find({
      where: { userId, tenantId },
    });

    if (assignments.length === 0) {
      return [];
    }

    const roleIds = assignments.map((a) => a.roleId);
    const roles = await this.rolesRepository
      .createQueryBuilder('role')
      .where('role.id IN (:...roleIds)', { roleIds })
      .getMany();

    return roles.map((r) => r.code);
  }

  private toUserProfile(user: UserEntity, roles: string[]): AuthenticatedUser {
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      fullName: user.fullName,
      roles,
    };
  }

  private parseExpiresInSeconds(): number {
    const expiresIn = process.env.JWT_EXPIRES_IN ?? '8h';
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 28800;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };
    return value * (multipliers[unit] ?? 3600);
  }
}
