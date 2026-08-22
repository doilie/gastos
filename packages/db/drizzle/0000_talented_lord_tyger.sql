CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"is_archived" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_income" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"cutoff_day" integer NOT NULL,
	"is_archived" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "envelope_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payday_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"payday_days_of_month" integer[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sub_envelope_accounts" (
	"sub_envelope_id" text NOT NULL,
	"account_id" text NOT NULL,
	CONSTRAINT "sub_envelope_accounts_sub_envelope_id_account_id_pk" PRIMARY KEY("sub_envelope_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "sub_envelopes" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"group_id" text,
	"is_archived" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"category_id" text,
	"account_id" text NOT NULL,
	"sub_envelope_id" text NOT NULL,
	"counter_transaction_id" text,
	"amount" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_period_year" integer NOT NULL,
	"budget_period_month" integer NOT NULL,
	"payday_date" date NOT NULL,
	"sub_envelope_id" text NOT NULL,
	"amount" integer NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_purchases" (
	"id" text PRIMARY KEY NOT NULL,
	"credit_card_id" text NOT NULL,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"category_id" text,
	"amount" integer NOT NULL,
	"funding_source_kind" text,
	"funding_source_account_id" text,
	"funding_source_envelope_id" text
);
--> statement-breakpoint
ALTER TABLE "sub_envelope_accounts" ADD CONSTRAINT "sub_envelope_accounts_sub_envelope_id_sub_envelopes_id_fk" FOREIGN KEY ("sub_envelope_id") REFERENCES "public"."sub_envelopes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_envelope_accounts" ADD CONSTRAINT "sub_envelope_accounts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_envelopes" ADD CONSTRAINT "sub_envelopes_group_id_envelope_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."envelope_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_sub_envelope_id_sub_envelopes_id_fk" FOREIGN KEY ("sub_envelope_id") REFERENCES "public"."sub_envelopes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_counter_transaction_id_transactions_id_fk" FOREIGN KEY ("counter_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_sub_envelope_id_sub_envelopes_id_fk" FOREIGN KEY ("sub_envelope_id") REFERENCES "public"."sub_envelopes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_purchases" ADD CONSTRAINT "card_purchases_credit_card_id_credit_cards_id_fk" FOREIGN KEY ("credit_card_id") REFERENCES "public"."credit_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_purchases" ADD CONSTRAINT "card_purchases_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_purchases" ADD CONSTRAINT "card_purchases_funding_source_account_id_accounts_id_fk" FOREIGN KEY ("funding_source_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_purchases" ADD CONSTRAINT "card_purchases_funding_source_envelope_id_sub_envelopes_id_fk" FOREIGN KEY ("funding_source_envelope_id") REFERENCES "public"."sub_envelopes"("id") ON DELETE no action ON UPDATE no action;