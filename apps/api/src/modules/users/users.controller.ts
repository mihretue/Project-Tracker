import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService, SafeUser } from './users.service';
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

  @ApiOperation({ summary: 'Get a user profile by ID (own profile only)' })
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  getById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User): SafeUser {
    // Decided before any lookup, so the response never reveals whether another ID exists.
    // Account creation is only available through POST /auth/register.
    if (id !== user.id) {
      throw new ForbiddenException('Access denied: you can only view your own profile');
    }
    return this.usersService.toSafeUser(user);
  }
}
