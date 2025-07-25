import { MigrationInterface, QueryRunner } from 'typeorm';

export class SwitchToUuidAndRefactorServices1753106611579
  implements MigrationInterface
{
  name = 'SwitchToUuidAndRefactorServices1753106611579';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP CONSTRAINT "FK_e08fca67ca8966e6b9914bf2956"`
    );
    await queryRunner.query(
      `CREATE TABLE "projects" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" character varying, CONSTRAINT "PK_6271df0a7aed1d6c0691ce6ac50" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `ALTER TABLE "estimates" DROP CONSTRAINT "FK_d9d30f6971adee44bd2eba9389a"`
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP CONSTRAINT "PK_8d12ff38fcc62aaba2cab748772"`
    );
    await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN "id"`);
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD "id" uuid NOT NULL DEFAULT uuid_generate_v4()`
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "PK_8d12ff38fcc62aaba2cab748772" PRIMARY KEY ("id")`
    );
    await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN "projectId"`);
    await queryRunner.query(`ALTER TABLE "tasks" ADD "projectId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "estimates" DROP CONSTRAINT "FK_97db78591ba0170ad2fb30dfbeb"`
    );
    await queryRunner.query(
      `ALTER TABLE "estimates" DROP CONSTRAINT "PK_447af75b2f6025adf7f80703810"`
    );
    await queryRunner.query(`ALTER TABLE "estimates" DROP COLUMN "id"`);
    await queryRunner.query(
      `ALTER TABLE "estimates" ADD "id" uuid NOT NULL DEFAULT uuid_generate_v4()`
    );
    await queryRunner.query(
      `ALTER TABLE "estimates" ADD CONSTRAINT "PK_447af75b2f6025adf7f80703810" PRIMARY KEY ("id")`
    );
    await queryRunner.query(`ALTER TABLE "estimates" DROP COLUMN "taskId"`);
    await queryRunner.query(`ALTER TABLE "estimates" ADD "taskId" uuid`);
    await queryRunner.query(`ALTER TABLE "estimates" DROP COLUMN "userId"`);
    await queryRunner.query(`ALTER TABLE "estimates" ADD "userId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433"`
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "id"`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD "id" uuid NOT NULL DEFAULT uuid_generate_v4()`
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")`
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "FK_e08fca67ca8966e6b9914bf2956" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "estimates" ADD CONSTRAINT "FK_d9d30f6971adee44bd2eba9389a" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "estimates" ADD CONSTRAINT "FK_97db78591ba0170ad2fb30dfbeb" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "estimates" DROP CONSTRAINT "FK_97db78591ba0170ad2fb30dfbeb"`
    );
    await queryRunner.query(
      `ALTER TABLE "estimates" DROP CONSTRAINT "FK_d9d30f6971adee44bd2eba9389a"`
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP CONSTRAINT "FK_e08fca67ca8966e6b9914bf2956"`
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433"`
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "id"`);
    await queryRunner.query(`ALTER TABLE "users" ADD "id" SERIAL NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")`
    );
    await queryRunner.query(`ALTER TABLE "estimates" DROP COLUMN "userId"`);
    await queryRunner.query(`ALTER TABLE "estimates" ADD "userId" integer`);
    await queryRunner.query(`ALTER TABLE "estimates" DROP COLUMN "taskId"`);
    await queryRunner.query(`ALTER TABLE "estimates" ADD "taskId" integer`);
    await queryRunner.query(
      `ALTER TABLE "estimates" DROP CONSTRAINT "PK_447af75b2f6025adf7f80703810"`
    );
    await queryRunner.query(`ALTER TABLE "estimates" DROP COLUMN "id"`);
    await queryRunner.query(`ALTER TABLE "estimates" ADD "id" SERIAL NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "estimates" ADD CONSTRAINT "PK_447af75b2f6025adf7f80703810" PRIMARY KEY ("id")`
    );
    await queryRunner.query(
      `ALTER TABLE "estimates" ADD CONSTRAINT "FK_97db78591ba0170ad2fb30dfbeb" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN "projectId"`);
    await queryRunner.query(`ALTER TABLE "tasks" ADD "projectId" integer`);
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP CONSTRAINT "PK_8d12ff38fcc62aaba2cab748772"`
    );
    await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN "id"`);
    await queryRunner.query(`ALTER TABLE "tasks" ADD "id" SERIAL NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "PK_8d12ff38fcc62aaba2cab748772" PRIMARY KEY ("id")`
    );
    await queryRunner.query(
      `ALTER TABLE "estimates" ADD CONSTRAINT "FK_d9d30f6971adee44bd2eba9389a" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
    await queryRunner.query(`DROP TABLE "projects"`);
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "FK_e08fca67ca8966e6b9914bf2956" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`
    );
  }
}
