import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(username: string, password: string): Promise<{ token: string }> {
    const user = await this.prisma.panelUser.findUnique({ where: { username } });

    // Same error message for both "user not found" and "wrong password" to
    // prevent user enumeration.
    const invalid = new UnauthorizedException('Invalid username or password');
    if (!user) throw invalid;

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw invalid;

    const token = this.jwt.sign({ sub: user.id, username: user.username });
    return { token };
  }
}
