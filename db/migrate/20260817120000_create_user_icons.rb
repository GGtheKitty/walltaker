class CreateUserIcons < ActiveRecord::Migration[7.2]
  ICONS = {
    'gios' => 'logo-octocat',
    'gray' => 'train-outline'
  }.freeze

  def change
    create_table :user_icons do |t|
      t.references :user, null: false, foreign_key: true, index: { unique: true }
      t.string :icon_name, null: false

      t.timestamps
    end

    reversible do |direction|
      direction.up do
        user = Class.new(ActiveRecord::Base) do
          self.table_name = 'users'
        end
        user_icon = Class.new(ActiveRecord::Base) do
          self.table_name = 'user_icons'
        end
        now = Time.current

        ICONS.each do |username, icon_name|
          matching_user = user.find_by('lower(username) = ?', username)
          user_icon.create!(user_id: matching_user.id, icon_name:, created_at: now, updated_at: now) if matching_user
        end
      end
    end
  end
end
