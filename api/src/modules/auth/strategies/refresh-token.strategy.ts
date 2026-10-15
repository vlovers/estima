import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { tokenSecret, validateTokenClaims } from '../token-security';

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh'
) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          const refreshToken = req.cookies?.['refreshToken'];
          if (
            typeof refreshToken !== 'string' ||
            !refreshToken ||
            refreshToken.length > 8192
          ) {
            return null;
          }
          return refreshToken;
        },
      ]),
      algorithms: ['HS256'],
      secretOrKey: tokenSecret(configService, 'refresh'),
      passReqToCallback: true,
    });
  }

  validate(
    req: Request,
    payload: {
      sub: string;
      email: string;
      iat: number;
      exp: number;
      tokenUse: string;
      jti: string;
    }
  ) {
    validateTokenClaims(payload, 'refresh');
    const refreshToken = req.cookies?.['refreshToken'];
    return {
      userId: payload.sub,
      email: payload.email,
      refreshToken,
    };
  }
}
