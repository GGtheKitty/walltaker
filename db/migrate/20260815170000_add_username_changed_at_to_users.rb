class AddUsernameChangedAtToUsers < ActiveRecord::Migration[7.2]
  def change
    add_column :users, :username_changed_at, :datetime
  end
end
