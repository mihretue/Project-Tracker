import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { PlatformRole } from '../../common/enums/platform-role.enum';

export interface SafeUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  platformRole: PlatformRole;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findAll(): Promise<SafeUser[]> {
    const users = await this.userRepository.find();
    return users.map((u) => this.toSafeUser(u));
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['memberships', 'memberships.organization'],
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email: email.toLowerCase().trim() },
    });
  }

  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('LOWER(user.email) = LOWER(:email)', { email: email.trim() })
      .getOne();
  }

  async create(createUserDto: CreateUserDto): Promise<User> {
    const normalizedEmail = createUserDto.email.toLowerCase().trim();
    const existing = await this.findByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(createUserDto.password, saltRounds);

    const user = this.userRepository.create({
      email: normalizedEmail,
      passwordHash,
      firstName: createUserDto.firstName.trim(),
      lastName: createUserDto.lastName.trim(),
      isActive: true,
      // Always a normal user; PLATFORM_ADMIN can only be granted by the seed/bootstrap script.
      platformRole: PlatformRole.USER,
    });

    return this.userRepository.save(user);
  }

  toSafeUser(user: User): SafeUser {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      platformRole: user.platformRole,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
