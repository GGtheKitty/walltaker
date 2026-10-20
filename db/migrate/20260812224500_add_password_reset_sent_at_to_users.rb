class AddPasswordResetSentAtToUsers < ActiveRecord::Migration[7.2]
  def change
    add_column :users, :password_reset_sent_at, :datetime
  end
end
