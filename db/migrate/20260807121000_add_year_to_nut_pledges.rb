class AddYearToNutPledges < ActiveRecord::Migration[7.2]
  def up
    add_column :nut_pledges, :year, :integer

    # Legacy nut_pledges were the one-off NNN2024 records.
    execute "UPDATE nut_pledges SET year = 2024"

    change_column_null :nut_pledges, :year, false
    add_index :nut_pledges, [:user_id, :year], unique: true
  end

  def down
    remove_index :nut_pledges, [:user_id, :year]
    remove_column :nut_pledges, :year
  end
end
