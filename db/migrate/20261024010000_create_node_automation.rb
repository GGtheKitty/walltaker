class CreateNodeAutomation < ActiveRecord::Migration[7.2]
  def change
    create_table :node_automation_jobs do |t|
      t.string :job_key, limit: 160, null: false
      t.string :kind, null: false
      t.jsonb :payload, null: false, default: {}
      t.jsonb :result, null: false, default: {}
      t.string :status, null: false, default: 'queued'
      t.integer :attempts, null: false, default: 0
      t.datetime :run_at, null: false, default: -> { 'CURRENT_TIMESTAMP' }
      t.datetime :locked_at
      t.string :locked_by
      t.string :last_error
      t.datetime :completed_at
      t.timestamps
    end
    add_index :node_automation_jobs, :job_key, unique: true
    add_index :node_automation_jobs, [:run_at, :id], where: "status = 'queued'"
    add_index :node_automation_jobs, :locked_at, where: "status = 'running'"
    add_check_constraint :node_automation_jobs, "status IN ('queued','running','completed','failed')", name: 'node_automation_job_status'

    create_table :node_automation_schedules, id: false do |t|
      t.string :name, null: false, primary_key: true
      t.datetime :next_run_at, null: false
      t.timestamps
    end

    create_table :node_newsroom_states do |t|
      t.bigint :generation, null: false, default: 0
      t.bigint :rendered_event_id
      t.string :kind
      t.jsonb :entry, null: false, default: {}
      t.jsonb :story, null: false, default: {}
      t.datetime :busy_until
      t.datetime :throttle_until
      t.timestamps
    end
    execute "INSERT INTO node_newsroom_states (id,created_at,updated_at) VALUES (1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"

    create_table :node_automation_events do |t|
      t.string :request_key, limit: 160, null: false
      t.bigint :generation, null: false
      t.jsonb :effects, null: false, default: {}
      t.datetime :delivered_at
      t.integer :delivery_attempts, null: false, default: 0
      t.datetime :available_at, null: false, default: -> { 'CURRENT_TIMESTAMP' }
      t.timestamps
    end
    add_index :node_automation_events, :request_key, unique: true
    add_index :node_automation_events, :available_at, where: 'delivered_at IS NULL'
  end
end
