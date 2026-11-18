import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService, SafeUser } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PlatformRoles } from '../auth/decorators/platform-roles.decorator';
import { PlatformRolesGuard } from '../auth/guards/platform-roles.guard';
import { PlatformRole } from '../../common/enums/platform-role.enum';
import { User } from './entities/user.entity';

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: 'Get current user profile' })
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getProfile(@CurrentUser() user: User): SafeUser {
    return this.usersService.toSafeUser(user);
  }

  @ApiOperation({ summary: 'List all users (PLATFORM_ADMIN only)' })
  @Get()
  @UseGuards(JwtAuthGuard, PlatformRolesGuard)
  @PlatformRoles(PlatformRole.PLATFORM_ADMIN)
  async findAll(): Promise<SafeUser[]> {
    return this.usersService.findAll();
  }

  @ApiOperation({ summary: 'Get user by ID' })
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<SafeUser> {
    const user = await this.usersService.findById(id);
    return this.usersService.toSafeUser(user);
  }

  @ApiOperation({ summary: 'Create user account' })
  @Post()
  async create(@Body() createUserDto: CreateUserDto): Promise<SafeUser> {
    const user = await this.usersService.create(createUserDto);
    return this.usersService.toSafeUser(user);
  }
}
