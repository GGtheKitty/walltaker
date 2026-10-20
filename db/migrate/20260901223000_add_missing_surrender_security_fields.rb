class AddMissingSurrenderSecurityFields < ActiveRecord::Migration[7.2]
  class MigrationSurrender < ActiveRecord::Base
    self.table_name = 'surrenders'
  end

  def up
    add_reference :surrenders, :controller_user, foreign_key: { to_table: :users }
    add_column :surrenders, :duration_hours, :integer, default: 24, null: false
    add_column :surrenders, :token, :string

    execute <<~SQL.squish
      UPDATE surrenders
      SET controller_user_id = CASE
        WHEN friendships.sender_id = surrenders.user_id THEN friendships.receiver_id
        ELSE friendships.sender_id
      END
      FROM friendships
      WHERE friendships.id = surrenders.friendship_id
    SQL

    MigrationSurrender.reset_column_information
    MigrationSurrender.where(token: nil).find_each do |surrender|
      surrender.update_columns(token: SecureRandom.uuid)
    end

    change_column_null :surrenders, :controller_user_id, false
    change_column_null :surrenders, :token, false
    add_index :surrenders, :token, unique: true
    add_index :surrenders, %i[user_id controller_user_id], unique: true
  end

  def down
    remove_index :surrenders, column: %i[user_id controller_user_id]
    remove_index :surrenders, :token
    remove_column :surrenders, :token
    remove_column :surrenders, :duration_hours
    remove_reference :surrenders, :controller_user, foreign_key: { to_table: :users }
  end
end
