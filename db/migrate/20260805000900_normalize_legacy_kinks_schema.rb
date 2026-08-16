class NormalizeLegacyKinksSchema < ActiveRecord::Migration[7.2]
  def up
    return unless table_exists?(:kinks)

    create_table :kink_havers, if_not_exists: true do |t|
      t.belongs_to :kink, foreign_key: true
      t.belongs_to :user, foreign_key: true
      t.timestamps
    end

    add_column :kink_havers, :is_starred, :boolean, default: false, null: false unless column_exists?(:kink_havers, :is_starred)

    if column_exists?(:kinks, :user_id)
      normalize_legacy_kinks

      remove_foreign_key :kinks, :users if foreign_key_exists?(:kinks, :users)
      remove_index :kinks, column: [:user_id, :name] if index_exists?(:kinks, [:user_id, :name])
      remove_index :kinks, :user_id if index_exists?(:kinks, :user_id)
      remove_column :kinks, :user_id
    end

    remove_column :kinks, :e621_valid if column_exists?(:kinks, :e621_valid)
    remove_column :kinks, :starred if column_exists?(:kinks, :starred)
    add_index :kinks, :name unless index_exists?(:kinks, :name)
  end

  def down
    add_reference :kinks, :user, null: true, foreign_key: true unless column_exists?(:kinks, :user_id)
    add_column :kinks, :e621_valid, :boolean, default: false, null: false unless column_exists?(:kinks, :e621_valid)
    add_column :kinks, :starred, :boolean, default: false, null: false unless column_exists?(:kinks, :starred)
  end

  private

  def normalize_legacy_kinks
    legacy_rows = select_all("SELECT id, user_id, name FROM kinks WHERE user_id IS NOT NULL").to_a
    canonical_ids = {}

    legacy_rows.group_by { |row| normalize_name(row["name"]) }.each do |name, rows|
      canonical = rows.min_by { |row| row["id"].to_i }
      canonical_ids[name] = canonical["id"].to_i

      execute sanitize_sql_array(["UPDATE kinks SET name = ? WHERE id = ?", name, canonical["id"]])

      rows.each do |row|
        next unless row["user_id"]

        execute sanitize_sql_array([
          <<~SQL.squish,
            INSERT INTO kink_havers (kink_id, user_id, created_at, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT DO NOTHING
          SQL
          canonical_ids[name],
          row["user_id"]
        ])
      end

      duplicate_ids = rows.map { |row| row["id"].to_i } - [canonical_ids[name]]
      next if duplicate_ids.empty?

      execute "UPDATE kink_havers SET kink_id = #{canonical_ids[name]} WHERE kink_id IN (#{duplicate_ids.join(',')})"
      execute "DELETE FROM kinks WHERE id IN (#{duplicate_ids.join(',')})"
    end
  end

  def normalize_name(name)
    name.to_s.gsub(/[^\w\d_\-\(\)\/\s]/, '').strip.squish.downcase.gsub(/\s/, '_')
  end

  def sanitize_sql_array(values)
    ActiveRecord::Base.sanitize_sql_array(values)
  end
end
