class NutPledge < ApplicationRecord
  belongs_to :user
  belongs_to :past_link, optional: true

  validates :year, presence: true, uniqueness: { scope: :user_id }

  delegate :post_url, to: :past_link, allow_nil: true

  scope :latest_first, -> { order(year: :desc, created_at: :desc) }

  before_validation :set_default_year, on: :create

  def failed?
    failed_on.present?
  end

  def succeeded?
    year < Time.current.year && !failed?
  end

  private

  def set_default_year
    self.year ||= Time.current.year
  end
end
