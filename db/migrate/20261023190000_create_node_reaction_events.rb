class CreateNodeReactionEvents < ActiveRecord::Migration[7.2]
  def change
    create_table :node_reaction_events do |t|
      t.string :request_key, limit: 160, null: false, index: { unique: true }
      t.string :payload_digest, limit: 64, null: false
      t.bigint :link_id, null: false
      t.bigint :comment_ids, array: true, null: false, default: []
      t.bigint :notification_id
      t.boolean :history_changed, null: false, default: false
      t.datetime :delivered_at
      t.integer :delivery_attempts, null: false, default: 0
      t.datetime :available_at, null: false, default: -> { 'CURRENT_TIMESTAMP' }
      t.timestamps
    end
    add_index :node_reaction_events, :id, where: 'delivered_at IS NULL', name: 'index_pending_node_reaction_events'
    reversible do |direction|
      direction.up do
        execute <<~SQL
          CREATE FUNCTION public.walltaker_api_authenticate(supplied_key text) RETURNS bigint
          LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
            SELECT id FROM public.users
            WHERE deleted_at IS NULL AND api_key = supplied_key AND length(supplied_key) > 0
            ORDER BY id LIMIT 1
          $$;
          REVOKE ALL ON FUNCTION public.walltaker_api_authenticate(text) FROM PUBLIC;
        SQL
      end
      direction.down { execute 'DROP FUNCTION public.walltaker_api_authenticate(text)' }
    end
  end
end
