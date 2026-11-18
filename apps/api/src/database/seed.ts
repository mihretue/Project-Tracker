import * as bcrypt from 'bcryptjs';
import dataSource from './data-source';
import { User } from '../modules/users/entities/user.entity';
import { Organization } from '../modules/organizations/entities/organization.entity';
import { OrganizationMembership } from '../modules/organizations/entities/organization-membership.entity';
import { Project } from '../modules/projects/entities/project.entity';
import { Task } from '../modules/tasks/entities/task.entity';
import { MembershipRole } from '../common/enums/role.enum';
import { TaskStatus } from '../common/enums/task-status.enum';
import { TaskPriority } from '../common/enums/task-priority.enum';

async function seed(): Promise<void> {
  console.log('🌱 Starting database seeding for Multi-Tenant Project Tracker...\n');

  await dataSource.initialize();
  console.log('✅ Connected to database.');

  const userRepo = dataSource.getRepository(User);
  const orgRepo = dataSource.getRepository(Organization);
  const membershipRepo = dataSource.getRepository(OrganizationMembership);
  const projectRepo = dataSource.getRepository(Project);
  const taskRepo = dataSource.getRepository(Task);

  const passwordHash = await bcrypt.hash('Password123!', 10);

  // 1. Seed Users (1 Admin, 1 Member)
  let adminUser = await userRepo.findOne({ where: { email: 'admin@abyssinia.test' } });
  if (!adminUser) {
    adminUser = userRepo.create({
      email: 'admin@abyssinia.test',
      passwordHash,
      firstName: 'Abebe',
      lastName: 'Bikila',
      isActive: true,
    });
    adminUser = await userRepo.save(adminUser);
    console.log(`👤 Created Admin User: ${adminUser.email} (${adminUser.firstName} ${adminUser.lastName})`);
  } else {
    console.log(`ℹ️ Admin User already exists: ${adminUser.email}`);
  }

  let memberUser = await userRepo.findOne({ where: { email: 'member@abyssinia.test' } });
  if (!memberUser) {
    memberUser = userRepo.create({
      email: 'member@abyssinia.test',
      passwordHash,
      firstName: 'Derartu',
      lastName: 'Tulu',
      isActive: true,
    });
    memberUser = await userRepo.save(memberUser);
    console.log(`👤 Created Member User: ${memberUser.email} (${memberUser.firstName} ${memberUser.lastName})`);
  } else {
    console.log(`ℹ️ Member User already exists: ${memberUser.email}`);
  }

  // 2. Seed Organization (Tenant)
  let org = await orgRepo.findOne({ where: { slug: 'abyssinia-tech' } });
  if (!org) {
    org = orgRepo.create({
      name: 'Abyssinia Technologies PLC',
      slug: 'abyssinia-tech',
    });
    org = await orgRepo.save(org);
    console.log(`🏢 Created Organization: ${org.name} (slug: ${org.slug})`);
  } else {
    console.log(`ℹ️ Organization already exists: ${org.name}`);
  }

  // 3. Seed Memberships with Different Roles
  let adminMembership = await membershipRepo.findOne({
    where: { organizationId: org.id, userId: adminUser.id },
  });
  if (!adminMembership) {
    adminMembership = membershipRepo.create({
      organizationId: org.id,
      userId: adminUser.id,
      role: MembershipRole.ADMIN,
    });
    await membershipRepo.save(adminMembership);
    console.log(`🔑 Assigned ${adminUser.email} -> ADMIN in ${org.name}`);
  }

  let regularMembership = await membershipRepo.findOne({
    where: { organizationId: org.id, userId: memberUser.id },
  });
  if (!regularMembership) {
    regularMembership = membershipRepo.create({
      organizationId: org.id,
      userId: memberUser.id,
      role: MembershipRole.MEMBER,
    });
    await membershipRepo.save(regularMembership);
    console.log(`🔑 Assigned ${memberUser.email} -> MEMBER in ${org.name}`);
  }

  // 4. Seed Project with ETB Budget
  let project = await projectRepo.findOne({
    where: { organizationId: org.id, name: 'Mobile Banking Platform' },
  });
  if (!project) {
    project = projectRepo.create({
      name: 'Mobile Banking Platform',
      description: 'Core transaction processing and ETB payment integration engine',
      budget: '750000.00',
      currency: 'ETB',
      organizationId: org.id,
    });
    project = await projectRepo.save(project);
    console.log(`📁 Created Project: "${project.name}" (Budget: 750,000.00 ETB)`);
  } else {
    console.log(`ℹ️ Project already exists: "${project.name}"`);
  }

  // 5. Seed Tasks with Priorities and Estimated Costs
  const seedTasks = [
    {
      title: 'Core Banking API Gateway Integration',
      description: 'Integrate ISO-8583 switch with local telebirr and CBE payment gateways',
      status: TaskStatus.COMPLETED,
      priority: TaskPriority.HIGH,
      estimatedCost: '180000.00',
    },
    {
      title: 'Biometric Authentication & Security Hardening',
      description: 'FIDO2 biometric login, certificate pinning, and rate limiting',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      estimatedCost: '220000.00',
    },
    {
      title: 'Transaction Statement PDF Exporter',
      description: 'Generate monthly customer financial statement reports in Amharic & English',
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
      estimatedCost: '85000.00',
    },
    {
      title: 'Offline Mode Transaction Caching',
      description: 'Encrypted local SQLite queue for low-connectivity environments',
      status: TaskStatus.TODO,
      priority: TaskPriority.LOW,
      estimatedCost: '65000.00',
    },
  ];

  for (const t of seedTasks) {
    const existingTask = await taskRepo.findOne({
      where: { projectId: project.id, title: t.title },
    });
    if (!existingTask) {
      const task = taskRepo.create({
        ...t,
        currency: 'ETB',
        projectId: project.id,
      });
      await taskRepo.save(task);
      console.log(`   📌 Task: "${t.title}" | Priority: ${t.priority} | Cost: ${t.estimatedCost} ETB [${t.status}]`);
    }
  }

  console.log('\n✨ Database seeding completed successfully!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Seeded Demonstration Credentials:');
  console.log('   Organization: Abyssinia Technologies PLC (abyssinia-tech)');
  console.log('   Admin Login : admin@abyssinia.test  | Password: Password123!');
  console.log('   Member Login: member@abyssinia.test | Password: Password123!');
  console.log('   Project     : Mobile Banking Platform (Budget: 750,000.00 ETB)');
  console.log('   Allocated   : 550,000.00 ETB (73.3% allocated, 200,000.00 ETB remaining)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await dataSource.destroy();
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
