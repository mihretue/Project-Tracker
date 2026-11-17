import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { OrganizationMembership } from './organization-membership.entity';
import { Project } from '../../projects/entities/project.entity';

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100, unique: true })
  slug: string;

  @OneToMany(
    () => OrganizationMembership,
    (membership) => membership.organization,
    { cascade: true },
  )
  memberships: OrganizationMembership[];

  @OneToMany(() => Project, (project) => project.organization, {
    cascade: true,
  })
  projects: Project[];

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
