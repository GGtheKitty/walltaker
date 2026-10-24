class CreateNodeModerationEvents < ActiveRecord::Migration[7.2]
  def change
    create_table :node_moderation_events do |t|
      t.string :request_key, limit: 160, null: false
      t.string :payload_digest, limit: 64, null: false
      t.string :operation, null: false
      t.bigint :user_id
      t.jsonb :result, null: false, default: {}
      t.jsonb :effects, null: false, default: {}
      t.datetime :delivered_at
      t.integer :delivery_attempts, null: false, default: 0
      t.datetime :available_at, null: false, default: -> { 'CURRENT_TIMESTAMP' }
      t.timestamps
    end
    add_index :node_moderation_events, :request_key, unique: true
    add_index :node_moderation_events, :available_at, where: 'delivered_at IS NULL'
  end
end
