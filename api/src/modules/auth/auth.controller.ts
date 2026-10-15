import {
  Controller,
  Post,
  UseGuards,
  Request,
  Body,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard, RefreshAuthGuard } from './guards/auth-request.guards';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { Response } from 'express';
import { Public } from './decorators/public.decorator';
import { GetCurrentUser } from './decorators/get-current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private readonly refreshCookieName = 'refreshToken';

  private getRefreshCookieOptions() {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
    };
  }

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Request() req,
    @Res({ passthrough: true }) res: Response
  ): Promise<{ accessToken: string; user: any }> {
    const tokens = await this.authService.login(req.user);
    res.cookie(
      this.refreshCookieName,
      tokens.refreshToken,
      this.getRefreshCookieOptions()
    );
    const { password, refreshToken, ...user } = req.user;
    return { accessToken: tokens.accessToken, user };
  }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() createUserDto: CreateUserDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<{ accessToken: string; user: any }> {
    const { user, tokens } = await this.authService.register(createUserDto);
    res.cookie(
      this.refreshCookieName,
      tokens.refreshToken,
      this.getRefreshCookieOptions()
    );
    return { accessToken: tokens.accessToken, user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(
    @GetCurrentUser('userId') userId: string,
    @Res({ passthrough: true }) res: Response
  ) {
    res.clearCookie(this.refreshCookieName, this.getRefreshCookieOptions());
    return this.authService.logout(userId);
  }

  @Public()
  @UseGuards(RefreshAuthGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshTokens(
    @GetCurrentUser('userId') userId: string,
    @GetCurrentUser('refreshToken') refreshToken: string,
    @Res({ passthrough: true }) res: Response
  ) {
    const tokens = await this.authService.refreshTokens(userId, refreshToken);
    res.cookie(
      this.refreshCookieName,
      tokens.refreshToken,
      this.getRefreshCookieOptions()
    );
    return { accessToken: tokens.accessToken };
  }
}
