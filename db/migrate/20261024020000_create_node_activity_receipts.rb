class CreateNodeActivityReceipts < ActiveRecord::Migration[7.2]
  disable_ddl_transaction!

  def change
    create_table :node_activity_receipts, if_not_exists: true do |t|
      t.string :request_key, limit: 160, null: false
      t.string :payload_digest, limit: 64, null: false
      t.string :operation, null: false
      t.jsonb :result, null: false, default: {}
      t.bigint :user_id
      t.timestamps
    end
    add_index :node_activity_receipts, :request_key, unique: true, if_not_exists: true, algorithm: :concurrently
    add_index :node_activity_receipts, :user_id, if_not_exists: true, algorithm: :concurrently
    add_index :history_events, [:user_id, :id], order: { id: :desc }, if_not_exists: true, algorithm: :concurrently
    add_index :ahoy_visits, :started_at, if_not_exists: true, algorithm: :concurrently
    add_index :ahoy_events, :time, if_not_exists: true, algorithm: :concurrently
  end
end
