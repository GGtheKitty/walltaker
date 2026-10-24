class CreateNodeAccountEvents < ActiveRecord::Migration[7.1]
  def change
    create_table :node_account_events do |t|
      t.string :request_key, limit: 160, null: false
      t.string :payload_digest, limit: 64, null: false
      t.bigint :user_id
      t.string :operation, null: false
      t.string :previous_username
      t.bigint :notification_id
      t.jsonb :result, null: false, default: {}
      t.datetime :delivered_at
      t.integer :delivery_attempts, null: false, default: 0
      t.datetime :available_at, null: false, default: -> { 'CURRENT_TIMESTAMP' }
      t.timestamps
    end
    add_index :node_account_events, :request_key, unique: true
    add_index :node_account_events, :available_at, where: 'delivered_at IS NULL', name: 'node_account_events_pending'
  end
end
