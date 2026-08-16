class AddE621PostIdsToLinks < ActiveRecord::Migration[7.2]
  def change
    add_column :links, :e621_post_id, :bigint
    add_column :past_links, :e621_post_id, :bigint
    add_index :links, :e621_post_id
    add_index :past_links, :e621_post_id
  end
end
