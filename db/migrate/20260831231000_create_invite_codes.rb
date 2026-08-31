class CreateInviteCodes < ActiveRecord::Migration[7.2]
  def change
    create_table :invite_codes do |t|
      t.string :code, null: false
      t.references :generated_by, null: true, foreign_key: { to_table: :users, on_delete: :nullify }
      t.references :redeemed_by, null: true, foreign_key: { to_table: :users, on_delete: :nullify }
      t.datetime :redeemed_at

      t.timestamps
    end

    add_index :invite_codes, :code, unique: true
  end
end
