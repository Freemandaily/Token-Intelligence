module.exports = class AddChain1675688593768 {
    name = 'AddChain1675688593768'

    async up(db) {
        // Drop old Token table relations on Transfer
        await db.query(`ALTER TABLE "transfer" DROP CONSTRAINT "FK_b27b1150b8a7af68424540613c7"`)
        await db.query(`DROP INDEX "public"."IDX_b27b1150b8a7af68424540613c"`)
        await db.query(`ALTER TABLE "transfer" DROP COLUMN "token_id"`)
        
        // Drop Token table
        await db.query(`DROP TABLE "token"`)

        // Add new chain-specific columns
        await db.query(`ALTER TABLE "transfer" ADD "token_address" text NOT NULL`)
        await db.query(`ALTER TABLE "transfer" ADD "chain" text NOT NULL`)
    }

    async down(db) {
        await db.query(`ALTER TABLE "transfer" DROP COLUMN "chain"`)
        await db.query(`ALTER TABLE "transfer" DROP COLUMN "token_address"`)

        await db.query(`CREATE TABLE "token" ("id" character varying NOT NULL, "name" text NOT NULL, "symbol" text NOT NULL, "total_supply" numeric NOT NULL, "decimals" integer NOT NULL, CONSTRAINT "PK_82fae97f905930df5d62a702fc9" PRIMARY KEY ("id"))`)
        await db.query(`ALTER TABLE "transfer" ADD "token_id" character varying`)
        
        await db.query(`CREATE INDEX "IDX_b27b1150b8a7af68424540613c" ON "transfer" ("token_id") `)
        await db.query(`ALTER TABLE "transfer" ADD CONSTRAINT "FK_b27b1150b8a7af68424540613c7" FOREIGN KEY ("token_id") REFERENCES "token"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`)
    }
}
