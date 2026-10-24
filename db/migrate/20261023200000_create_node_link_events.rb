class CreateNodeLinkEvents < ActiveRecord::Migration[7.2]
  def change
    create_table :node_link_events do |t|
      t.string :request_key, limit: 160, null: false, index: { unique: true }
      t.string :payload_digest, limit: 64, null: false
      t.bigint :link_id, null: false
      t.bigint :user_id, null: false
      t.string :operation, null: false
      t.jsonb :result, null: false
      t.datetime :delivered_at
      t.integer :delivery_attempts, null: false, default: 0
      t.datetime :available_at, null: false, default: -> { 'CURRENT_TIMESTAMP' }
      t.timestamps
    end
    add_index :node_link_events, :id, where: 'delivered_at IS NULL', name: 'index_pending_node_link_events'
  end
end
