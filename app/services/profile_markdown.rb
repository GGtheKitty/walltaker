class ProfileMarkdown
  MARKER = "<!-- walltaker:markdown -->\n".freeze
  MAX_LENGTH = 50_000

  OPTIONS = {
    extension: {
      autolink: true,
      header_ids: nil,
      insert: true,
      strikethrough: true,
      table: true,
      tagfilter: true
    },
    render: {
      hardbreaks: true,
      unsafe: true
    }
  }.freeze

  class << self
    def markdown?(content)
      content.to_s.start_with?(MARKER)
    end

    def source(content)
      markdown?(content) ? content.to_s.delete_prefix(MARKER) : content.to_s
    end

    def dump(content)
      "#{MARKER}#{source(content).first(MAX_LENGTH)}"
    end

    def to_html(content)
      Commonmarker.to_html(source(content), options: OPTIONS)
    end
  end
end
