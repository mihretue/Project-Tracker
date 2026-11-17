import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { Task } from '../../tasks/entities/task.entity';
import { NumericTransformer } from '../../../common/transformers/numeric.transformer';

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /**
   * Budget in Ethiopian Birr (ETB).
   * Stored as PostgreSQL numeric(14, 2) and represented as an exact decimal string
   * to avoid IEEE 754 binary floating-point precision loss.
   */
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: '0.00',
    transformer: new NumericTransformer(),
  })
  budget: string;

  @Column({ type: 'varchar', length: 3, default: 'ETB' })
  currency: string;

  @Index()
  @Column({ type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => Organization, (org) => org.projects, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @OneToMany(() => Task, (task) => task.project, {
    cascade: true,
  })
  tasks: Task[];

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
