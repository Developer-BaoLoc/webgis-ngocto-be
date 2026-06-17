import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '../common/decorators/public.decorator';
import {
  CurrentUser,
  RequestId,
} from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/api.types';
import { apiResponse } from '../common/utils/api-response.util';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @RequestId() requestId?: string) {
    const result = await this.authService.login(dto);
    return apiResponse(result, { requestId });
  }

  @Get('me')
  async me(
    @CurrentUser() user: AuthenticatedUser,
    @RequestId() requestId?: string,
  ) {
    const primaryOrganizationId =
      await this.authService.getPrimaryOrganizationId(user.id, user.tenantId);

    return apiResponse(
      {
        ...user,
        primaryOrganizationId,
      },
      { requestId },
    );
  }
}
