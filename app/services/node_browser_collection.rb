# A loaded render snapshot, with the small set of collection operations used by
# existing templates. It cannot issue SQL or silently load another association.
class NodeBrowserCollection < Array
  attr_reader :model
  def initialize(records = [], model = nil)
    super(records); @model = model
  end
  def where(criteria = nil, *values)
    return Filter.new(self) if criteria.nil?
    if criteria.is_a?(Hash)
      return self.class.new(select { |record| matches?(record, criteria) }, model)
    end
    if (match = /\A\s*(\w+)\s*(>=|<=|>|<|=)\s*\?\s*\z/.match(criteria.to_s))
      return self.class.new(select { |record| value = record.public_send(match[1]); value && value.public_send(match[2] == '=' ? '==' : match[2], values.first) }, model)
    end
    raise ArgumentError, 'This data selection must be implemented in Node.'
  end
  def order(*criteria)
    pairs = criteria.flat_map do |item|
      item.is_a?(Hash) ? item.to_a : item.to_s.split(',').map { |field| key, direction = field.strip.split; [key, direction || :asc] }
    end
    self.class.new(sort do |a, b|
      result = 0
      pairs.each do |key, direction|
        left, right = a.public_send(key), b.public_send(key)
        result = left.nil? ? (right.nil? ? 0 : 1) : right.nil? ? -1 : left <=> right
        result = -result if direction.to_s == 'desc'
        break unless result.zero?
      end
      result
    end, model)
  end
  def limit(value) = self.class.new(first(value), model)
  def offset(value) = self.class.new(drop(value), model)
  def all = self
  def includes(*) = self
  def joins(*) = self
  def left_joins(*) = self
  def reload(*) = self
  def find_each(**, &block) = each(&block)
  def pluck(*keys) = map { |record| keys.length == 1 ? record.public_send(keys.first) : keys.map { |key| record.public_send(key) } }
  def exists?(criteria = nil) = criteria.nil? ? any? : criteria.is_a?(Hash) ? where(criteria).any? : any? { |record| record.id.to_s == criteria.to_s }
  def find_by(criteria) = where(criteria).first
  def find(id = nil, &block)
    return super(&block) if block
    detect { |record| record.id.to_s == id.to_s } || raise(ActiveRecord::RecordNotFound)
  end
  def is_online = self.class.new(select(&:is_online?), model)
  def is_public = self.class.new(select { |link| !link.friends_only && (link.never_expires || link.expires && link.expires > Time.current) }, model)
  def are_starred = where(is_starred: true)
  def maximum(key) = pluck(key).compact.max
  def minimum(key) = pluck(key).compact.min
  def new(attributes = {}) = model.new(attributes)
  alias build new

  private

  def matches?(record, criteria)
    criteria.all? do |key, value|
      key = key.to_s.singularize unless record.respond_to?(key)
      actual = record.public_send(key)
      value.is_a?(Hash) ? actual && matches?(actual, value) : value.is_a?(Array) ? value.include?(actual) : actual == value
    end
  end
  class Filter
    def initialize(collection) = @collection = collection
    def not(criteria) = NodeBrowserCollection.new(@collection.reject { |record| @collection.send(:matches?, record, criteria) }, @collection.model)
  end
end
