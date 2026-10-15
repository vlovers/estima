import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { User } from './entities/user.entity';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

export type SafeUser = Omit<
  User,
  'password' | 'refreshToken' | 'projects'
>;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>
  ) {}

  async create(createUserDto: CreateUserDto): Promise<SafeUser> {
    const { email, password } = createUserDto;

    const existingUser = await this.userRepository.findOne({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const hashedPassword = await this.hashPassword(password);

    const user = this.userRepository.create({
      email,
      password: hashedPassword,
    });
    const inserted = await this.userRepository.insert(user);
    user.id = inserted.identifiers[0].id;
    return this.toSafeUser(user);
  }

  async findOneByEmail(email: string): Promise<User | undefined> {
    return this.userRepository.findOne({ where: { email } });
  }

  async findAll(userId?: string): Promise<SafeUser[]> {
    if (!userId) {
      const users = await this.userRepository.find();
      return users.map((user) => this.toSafeUser(user));
    }

    const user = await this.findOneOrThrow(userId);
    return [this.toSafeUser(user)];
  }

  findOne(id: string) {
    return this.userRepository.findOneBy({ id });
  }

  async findOwn(id: string, userId: string): Promise<SafeUser> {
    if (id !== userId) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    const user = await this.findOneOrThrow(id);
    return this.toSafeUser(user);
  }

  // Internal authentication updates may write credentials; the profile path below cannot.
  async update(
    id: string,
    updateUserDto: Partial<Pick<User, 'email' | 'password' | 'refreshToken'>>
  ) {
    const updateData = await this.prepareUserUpdate(updateUserDto);
    await this.userRepository.update(id, updateData);
    return this.findOne(id);
  }

  async clearRefreshToken(id: string): Promise<{ success: true }> {
    const result = await this.userRepository.update(id, { refreshToken: null });
    if (result.affected === 0) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    return { success: true };
  }

  async updateOwn(
    id: string,
    updateUserDto: UpdateUserDto,
    userId: string
  ): Promise<SafeUser> {
    if (id !== userId) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    if (updateUserDto.email !== undefined) {
      const result = await this.userRepository.update(id, {
        email: updateUserDto.email,
      });
      if (result.affected === 0) {
        throw new NotFoundException(`User with id ${id} not found`);
      }
    }

    const user = await this.findOneOrThrow(id);
    return this.toSafeUser(user);
  }

  async removeByEmail(email: string) {
    const user = await this.findOneByEmail(email);
    if (!user) {
      return { message: 'User not found' };
    }
    return this.userRepository.delete({ email });
  }

  async removeOwnByEmail(email: string, userId: string) {
    const user = await this.findOneOrThrow(userId);
    if (user.email !== email) {
      throw new NotFoundException(`User with email ${email} not found`);
    }
    return this.userRepository.delete({ id: userId });
  }

  remove(id: string) {
    return this.userRepository.delete(id);
  }

  async removeOwn(id: string, userId: string) {
    if (id !== userId) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    const result = await this.userRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    return result;
  }

  private async findOneOrThrow(id: string): Promise<User> {
    const user = await this.findOne(id);
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return user;
  }

  private async prepareUserUpdate(
    updateUserDto: Partial<Pick<User, 'email' | 'password' | 'refreshToken'>>
  ): Promise<Partial<Pick<User, 'email' | 'password' | 'refreshToken'>>> {
    return {
      email: updateUserDto.email,
      refreshToken: updateUserDto.refreshToken,
      password: updateUserDto.password
        ? await this.hashPassword(updateUserDto.password)
        : undefined,
    };
  }

  private hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  private toSafeUser(user: User): SafeUser {
    const { password, refreshToken, projects, ...safeUser } = user;
    void password;
    void refreshToken;
    void projects;
    return safeUser;
  }
}
