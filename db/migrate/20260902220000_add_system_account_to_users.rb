class AddSystemAccountToUsers < ActiveRecord::Migration[7.2]
  SYSTEM_ACCOUNT_USERNAMES = %w[
    apple
    banana
    cherry
    evil
    PornBot
    PornLizardKi
    PornLizardTaylor
    PornLizardWarren
  ].freeze

  class MigrationUser < ActiveRecord::Base
    self.table_name = 'users'
  end

  def up
    add_column :users, :system_account, :boolean, default: false, null: false

    MigrationUser.where('lower(username) IN (?)', SYSTEM_ACCOUNT_USERNAMES.map(&:downcase)).find_each do |user|
      user.update_columns(
        system_account: true,
        password_digest: BCrypt::Password.create(SecureRandom.base64(48))
      )
    end
  end

  def down
    remove_column :users, :system_account
  end
end
