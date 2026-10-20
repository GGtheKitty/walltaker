class AddSoftDeleteFieldsToUsers < ActiveRecord::Migration[7.2]
  def change
    add_column :users, :deleted_at, :datetime
    add_column :users, :deleted_username, :string
    add_index :users, :deleted_at
  end
end
