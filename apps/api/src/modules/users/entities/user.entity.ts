import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { PlatformRole } from '../../../common/enums/platform-role.enum';
import { OrganizationMembership } from '../../organizations/entities/organization-membership.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255, select: false })
  passwordHash: string;

  @Column({ type: 'varchar', length: 100 })
  firstName: string;

  @Column({ type: 'varchar', length: 100 })
  lastName: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /** Application-wide role. Never assignable through public registration. */
  @Column({
    type: 'enum',
    enum: PlatformRole,
    enumName: 'user_platform_role_enum',
    default: PlatformRole.USER,
  })
  platformRole: PlatformRole;

  @OneToMany(
    () => OrganizationMembership,
    (membership) => membership.user,
    { cascade: true },
  )
  memberships: OrganizationMembership[];

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
