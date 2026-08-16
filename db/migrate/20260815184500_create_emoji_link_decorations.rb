class CreateEmojiLinkDecorations < ActiveRecord::Migration[7.2]
  DECORATIONS = {
    1 => '🐕',
    69 => '🐇',
    343 => '🐺',
    346 => '🏳️‍🌈',
    348 => '🥎',
    581 => '⚙️',
    656 => '🐈',
    658 => '🐈',
    666 => '🐺',
    1964 => '🦊',
    7900 => '🐶',
    7914 => '🦴',
    11002 => '🐈‍⬛',
    11011 => '🐈‍⬛',
    12069 => '🐈‍⬛',
    12594 => '🐈‍⬛',
    12916 => '🪢',
    12951 => '🪢',
    13535 => '🪢',
    13577 => '🪢',
    15194 => '🪢',
    15673 => '🪟',
    16191 => '🐈‍⬛'
  }.freeze

  def change
    create_table :emoji_link_decorations do |t|
      t.bigint :link_id, null: false
      t.string :emoji, null: false

      t.timestamps
    end

    add_index :emoji_link_decorations, :link_id, unique: true

    reversible do |direction|
      direction.up do
        decoration = Class.new(ActiveRecord::Base) do
          self.table_name = 'emoji_link_decorations'
        end
        now = Time.current
        decoration.insert_all!(DECORATIONS.map { |link_id, emoji| { link_id:, emoji:, created_at: now, updated_at: now } })
      end
    end
  end
end
