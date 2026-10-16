import { ForbiddenException, Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import {
  matchesRefreshToken,
  refreshTokenDigest,
  tokenSecret,
} from './token-security';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    if (typeof email !== 'string' || typeof pass !== 'string') return null;
    const user = await this.usersService.findOneByEmail(email);
    if (user && (await this.usersService.verifyUserPassword(user, pass))) {
      const { password, refreshToken, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: any) {
    const tokens = await this.getTokens(user.id, user.email);
    await this.updateRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  }

  async register(createUserDto: CreateUserDto) {
    const newUser = await this.usersService.create(createUserDto);
    const tokens = await this.getTokens(newUser.id, newUser.email);
    await this.updateRefreshToken(newUser.id, tokens.refreshToken);
    return { tokens, user: newUser };
  }

  async logout(userId: string) {
    return this.usersService.clearRefreshToken(userId);
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.usersService.findOne(userId);
    if (!user || !user.refreshToken) {
      throw new ForbiddenException('Access Denied');
    }
    if (!matchesRefreshToken(refreshToken, user.refreshToken)) {
      throw new ForbiddenException('Access Denied');
    }
    const tokens = await this.getTokens(user.id, user.email);
    const rotated = await this.usersService.rotateRefreshToken(
      user.id,
      user.refreshToken,
      refreshTokenDigest(tokens.refreshToken)
    );
    if (!rotated) throw new ForbiddenException('Access Denied');
    return tokens;
  }

  async updateRefreshToken(userId: string, refreshToken: string) {
    await this.usersService.update(userId, {
      refreshToken: refreshTokenDigest(refreshToken),
    });
  }

  async getTokens(userId: string, email: string) {
    const accessSecret = tokenSecret(this.configService, 'access');
    const refreshSecret = tokenSecret(this.configService, 'refresh');
    const accessExpiresIn =
      this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') || '15m';
    const refreshExpiresIn =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d';

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email, tokenUse: 'access' },
        {
          secret: accessSecret,
          algorithm: 'HS256',
          expiresIn: accessExpiresIn,
        }
      ),
      this.jwtService.signAsync(
        { sub: userId, email, tokenUse: 'refresh', jti: randomUUID() },
        {
          secret: refreshSecret,
          algorithm: 'HS256',
          expiresIn: refreshExpiresIn,
        }
      ),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }
}
