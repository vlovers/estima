import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { tokenSecret, validateTokenClaims } from '../token-security';

type JwtPayload = {
  sub: string;
  email: string;
  iat: number;
  exp: number;
  tokenUse?: string;
};

@Injectable()
export class AccessTokenStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      algorithms: ['HS256'],
      secretOrKey: tokenSecret(configService, 'access'),
    });
  }

  validate(payload: JwtPayload) {
    validateTokenClaims(payload, 'access');
    return { userId: payload.sub, email: payload.email };
  }
}
