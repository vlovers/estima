import {
  BadRequestException,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { createAppValidationPipe } from '../../../validation.pipe';
import { LoginDto } from '../dto/login.dto';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    if (
      !request.body ||
      typeof request.body !== 'object' ||
      Array.isArray(request.body)
    ) {
      throw new BadRequestException('Invalid login request');
    }
    // Guards execute before global pipes: validate before Passport or bcrypt sees input.
    await createAppValidationPipe().transform(request.body, {
      type: 'body',
      metatype: LoginDto,
    });
    return super.canActivate(context) as Promise<boolean>;
  }
}

@Injectable()
export class RefreshAuthGuard extends AuthGuard('jwt-refresh') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const body = context.switchToHttp().getRequest().body;
    if (
      body !== undefined &&
      (!body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).length)
    ) {
      throw new BadRequestException(
        'Refresh requests must not contain body fields'
      );
    }
    return super.canActivate(context) as Promise<boolean>;
  }
}
