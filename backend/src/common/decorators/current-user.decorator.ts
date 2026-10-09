import { createParamDecorator, ExecutionContext } from '@nestjs/common';
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const r = ctx.switchToHttp().getRequest();
  return r.user;
});
