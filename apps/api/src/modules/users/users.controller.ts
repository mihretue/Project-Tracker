import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { UsersService, SafeUser } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from './entities/user.entity';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getProfile(@CurrentUser() user: User): SafeUser {
    return this.usersService.toSafeUser(user);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(): Promise<SafeUser[]> {
    return this.usersService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<SafeUser> {
    const user = await this.usersService.findById(id);
    return this.usersService.toSafeUser(user);
  }

  @Post()
  async create(@Body() createUserDto: CreateUserDto): Promise<SafeUser> {
    const user = await this.usersService.create(createUserDto);
    return this.usersService.toSafeUser(user);
  }
}
