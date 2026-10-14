import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRequiredConfig, JWT_REFRESH_SECRET_KEY } from '../jwt-config';

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh'
) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          const refreshToken = req.cookies['refreshToken'];
          if (!refreshToken) {
            return null;
          }
          return refreshToken;
        },
      ]),
      secretOrKey: getRequiredConfig(configService, JWT_REFRESH_SECRET_KEY),
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: { sub: string; email: string }) {
    const refreshToken = req.cookies['refreshToken'];
    return {
      userId: payload.sub,
      email: payload.email,
      refreshToken,
    };
  }
}
