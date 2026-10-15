import { registerDecorator, ValidationOptions } from 'class-validator';

// Do not let UTF-8 encoding replace distinct lone surrogates with U+FFFD.
// Valid Unicode is accepted verbatim, without normalization.
export function isWellFormedPassword(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

export function IsWellFormedPassword(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isWellFormedPassword',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: isWellFormedPassword,
        defaultMessage: () => 'Password must contain well-formed Unicode',
      },
    });
}
