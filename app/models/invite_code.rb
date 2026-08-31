class InviteCode < ApplicationRecord
  belongs_to :generated_by, class_name: 'User', optional: true
  belongs_to :redeemed_by, class_name: 'User', optional: true

  before_validation :normalize_code

  validates :code, presence: true, uniqueness: { case_sensitive: false }
  validates :redeemed_by, presence: true, if: :redeemed_at?
  validates :redeemed_at, absence: true, unless: :redeemed_by

  scope :available, -> { where(redeemed_at: nil) }

  def self.generate!(generated_by:)
    create!(code: SecureRandom.hex(8), generated_by:)
  rescue ActiveRecord::RecordNotUnique
    retry
  end

  def redeemed?
    redeemed_at.present?
  end

  def redeem!(user)
    raise ActiveRecord::RecordInvalid, self if redeemed?

    update!(redeemed_by: user, redeemed_at: Time.current)
  end

  private

  def normalize_code
    self.code = code.to_s.strip.upcase
  end
end
