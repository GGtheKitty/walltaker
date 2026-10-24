module MessageThreadHelper
  def convert_all_e621_links_to_source_links(string)
    matches = string.scan(/(https:\/\/e621\.net\/posts\/)(\d*)(\?[\w\=\&\%\+]*)?/)

    output = string
    matches.each do |match|
      root = match[0]
      post_id = match[1]
      meta = match[2] if match[2].present?
      meta = '' unless match[2].present?
      original_substring = root + post_id + meta

      url = E621.new.get_media_url(post_id)
      return 'Dead link :(' if url.blank?

      output = output.gsub(original_substring, url)
    end

    return output
  end
end
