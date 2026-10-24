class CreateNodeBrowserSessions < ActiveRecord::Migration[7.2]
  def change
    create_table :node_browser_sessions do |t|
      t.string :token_digest, limit: 64, null: false
      t.bigint :user_id, null: false
      t.bigint :original_actor_id
      t.bigint :surrender_id
      t.jsonb :legacy_fingerprints, default: [], null: false
      t.boolean :remember, null: false, default: false
      t.datetime :expires_at, null: false
      t.datetime :revoked_at
      t.timestamps
    end
    add_index :node_browser_sessions, :token_digest, unique: true
    add_index :node_browser_sessions, :user_id
    add_index :node_browser_sessions, :original_actor_id
    add_index :node_browser_sessions, :surrender_id
    add_index :node_browser_sessions, :expires_at
    create_table :node_browser_legacy_sessions, id: false do |t|
      t.string :fingerprint, limit: 64, primary_key: true
      t.bigint :user_id
      t.datetime :expires_at, null: false
      t.datetime :revoked_at
      t.datetime :created_at, null: false
    end
    add_index :node_browser_legacy_sessions, :user_id
  end
end
