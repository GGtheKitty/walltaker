class CreateProfileDomains < ActiveRecord::Migration[7.2]
  def change
    create_table :profile_domains do |t|
      t.string :domain, null: false
      t.integer :status, null: false, default: 0
      t.bigint :seen_count, null: false, default: 0
      t.datetime :first_seen_at, null: false
      t.datetime :last_seen_at, null: false
      t.references :reviewed_by, foreign_key: { to_table: :users, on_delete: :nullify }
      t.datetime :reviewed_at

      t.timestamps
    end

    add_index :profile_domains, :domain, unique: true
    add_index :profile_domains, [:status, :last_seen_at]
  end
end
