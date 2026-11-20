import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { TaskStatus } from '../../../common/enums/task-status.enum';
import { TaskPriority } from '../../../common/enums/task-priority.enum';
import { Project } from '../../projects/entities/project.entity';
import { NumericTransformer } from '../../../common/transformers/numeric.transformer';

@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 250 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: TaskStatus,
    default: TaskStatus.TODO,
  })
  status: TaskStatus;

  @Index()
  @Column({
    type: 'enum',
    enum: TaskPriority,
    default: TaskPriority.MEDIUM,
  })
  priority: TaskPriority;

  /**
   * Estimated cost in Ethiopian Birr (ETB).
   * Stored as PostgreSQL numeric(14, 2) and represented as an exact decimal string
   * to eliminate floating-point rounding errors.
   */
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: '0.00',
    transformer: new NumericTransformer(),
  })
  estimatedCost: string;

  @Column({ type: 'varchar', length: 3, default: 'ETB' })
  currency: string;

  /** Optional planned duration in whole days. NULL means "unknown" (see AddTaskDuration migration). */
  @Column({ type: 'integer', nullable: true })
  durationDays: number | null;

  @Index()
  @Column({ type: 'uuid' })
  projectId: string;

  @ManyToOne(() => Project, (project) => project.tasks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
