// Vietnam Administrative Structure (63 Tỉnh/Thành phố, Quận/Huyện, Phường/Xã)
// and Google Maps location/coordinate resolver

export interface AdministrativeMatch {
  matchedText: string;
  fullAddress: string;
  ward: string;
  district: string;
  province: string;
  hasWardCommune: boolean;
}

export function removeVietnameseDiacritics(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (m) => (m === 'đ' ? 'd' : 'D'))
    .toLowerCase();
}

// 63 Provinces & Municipalities
export const VN_PROVINCES: Array<{ standardName: string; aliases: string[] }> = [
  { standardName: 'Hà Nội', aliases: ['hà nội', 'ha noi', 'hn', 'thủ đô'] },
  { standardName: 'TP. Hồ Chí Minh', aliases: ['tp hồ chí minh', 'hồ chí minh', 'ho chi minh', 'hcm', 'tphcm', 'tp hcm', 'sài gòn', 'sai gon', 'sg'] },
  { standardName: 'Hải Phòng', aliases: ['hải phòng', 'hai phong', 'hp'] },
  { standardName: 'Đà Nẵng', aliases: ['đà nẵng', 'da nang', 'đn', 'dn'] },
  { standardName: 'Cần Thơ', aliases: ['cần thơ', 'can tho', 'ct'] },
  { standardName: 'Quảng Ninh', aliases: ['quảng ninh', 'quang ninh', 'qn'] },
  { standardName: 'Bắc Ninh', aliases: ['bắc ninh', 'bac ninh', 'bn'] },
  { standardName: 'Hưng Yên', aliases: ['hưng yên', 'hung yen', 'hy'] },
  { standardName: 'Hải Dương', aliases: ['hải dương', 'hai duong', 'hd'] },
  { standardName: 'Bắc Giang', aliases: ['bắc giang', 'bac giang', 'bg'] },
  { standardName: 'Vĩnh Phúc', aliases: ['vĩnh phúc', 'vinh phuc', 'vp'] },
  { standardName: 'Thái Nguyên', aliases: ['thái nguyên', 'thai nguyen', 'tn'] },
  { standardName: 'Nam Định', aliases: ['nam định', 'nam dinh', 'nđ'] },
  { standardName: 'Thái Bình', aliases: ['thái bình', 'thai binh', 'tb'] },
  { standardName: 'Hà Nam', aliases: ['hà nam', 'ha nam'] },
  { standardName: 'Ninh Bình', aliases: ['ninh bình', 'ninh binh', 'nb'] },
  { standardName: 'Thanh Hóa', aliases: ['thanh hóa', 'thanh hoa', 'th'] },
  { standardName: 'Nghệ An', aliases: ['nghệ an', 'nghe an', 'na'] },
  { standardName: 'Hà Tĩnh', aliases: ['hà tĩnh', 'ha tinh', 'ht'] },
  { standardName: 'Quảng Bình', aliases: ['quảng bình', 'quang binh', 'qb'] },
  { standardName: 'Quảng Trị', aliases: ['quảng trị', 'quang tri'] },
  { standardName: 'Thừa Thiên Huế', aliases: ['thừa thiên huế', 'thua thien hue', 'huế', 'hue', 'tth'] },
  { standardName: 'Quảng Nam', aliases: ['quảng nam', 'quang nam'] },
  { standardName: 'Quảng Ngãi', aliases: ['quảng ngãi', 'quang ngai'] },
  { standardName: 'Bình Định', aliases: ['bình định', 'binh dinh', 'quy nhơn'] },
  { standardName: 'Phú Yên', aliases: ['phú yên', 'phu yen', 'tuy hòa'] },
  { standardName: 'Khánh Hòa', aliases: ['khánh hòa', 'khanh hoa', 'nha trang', 'cam ranh'] },
  { standardName: 'Ninh Thuận', aliases: ['ninh thuận', 'ninh thuan', 'phan rang'] },
  { standardName: 'Bình Thuận', aliases: ['bình thuận', 'binh thuan', 'phan thiết'] },
  { standardName: 'Lâm Đồng', aliases: ['lâm đồng', 'lam dong', 'đà lạt', 'da lat', 'bảo lộc'] },
  { standardName: 'Đắk Lắk', aliases: ['đắk lắk', 'dak lak', 'daklak', 'buôn ma thuột', 'bmt'] },
  { standardName: 'Đắk Nông', aliases: ['đắk nông', 'dak nong', 'gia nghĩa'] },
  { standardName: 'Gia Lai', aliases: ['gia lai', 'pleiku'] },
  { standardName: 'Kon Tum', aliases: ['kon tum', 'kontum'] },
  { standardName: 'Bình Dương', aliases: ['bình dương', 'binh duong', 'thủ dầu một', 'dĩ an', 'thuận an', 'bến cát'] },
  { standardName: 'Đồng Nai', aliases: ['đồng nai', 'dong nai', 'biên hòa', 'long thành', 'nhơn trạch'] },
  { standardName: 'Bà Rịa - Vũng Tàu', aliases: ['bà rịa vũng tàu', 'ba ria vung tau', 'vũng tàu', 'vung tau', 'bà rịa', 'brvt', 'vt'] },
  { standardName: 'Tây Ninh', aliases: ['tây ninh', 'tay ninh'] },
  { standardName: 'Bình Phước', aliases: ['bình phước', 'binh phuoc', 'đồng xoài'] },
  { standardName: 'Long An', aliases: ['long an', 'tân an'] },
  { standardName: 'Tiền Giang', aliases: ['tiền giang', 'tien giang', 'mỹ tho', 'chợ gạo', 'gò công'] },
  { standardName: 'Bến Tre', aliases: ['bến tre', 'ben tre'] },
  { standardName: 'Trà Vinh', aliases: ['trà vinh', 'tra vinh'] },
  { standardName: 'Vĩnh Long', aliases: ['vĩnh long', 'vinh long'] },
  { standardName: 'Đồng Tháp', aliases: ['đồng tháp', 'dong thap', 'cao lãnh', 'sa đéc'] },
  { standardName: 'An Giang', aliases: ['an giang', 'long xuyên', 'châu đốc'] },
  { standardName: 'Kiên Giang', aliases: ['kiên giang', 'kien giang', 'rạch giá', 'phú quốc', 'hà tiên'] },
  { standardName: 'Hậu Giang', aliases: ['hậu giang', 'hau giang', 'vị thanh'] },
  { standardName: 'Sóc Trăng', aliases: ['sóc trăng', 'soc trang'] },
  { standardName: 'Bạc Liêu', aliases: ['bạc liêu', 'bac lieu'] },
  { standardName: 'Cà Mau', aliases: ['cà mau', 'ca mau'] },
  { standardName: 'Phú Thọ', aliases: ['phú thọ', 'phu tho', 'việt trì'] },
  { standardName: 'Hòa Bình', aliases: ['hòa bình', 'hoa binh'] },
  { standardName: 'Sơn La', aliases: ['sơn la', 'son la', 'mộc châu'] },
  { standardName: 'Điện Biên', aliases: ['điện biên', 'dien bien', 'điện biên phủ'] },
  { standardName: 'Lai Châu', aliases: ['lai châu', 'lai chau'] },
  { standardName: 'Lào Cai', aliases: ['lào cai', 'lao cai', 'sa pa', 'sapa'] },
  { standardName: 'Yên Bái', aliases: ['yên bái', 'yen bai'] },
  { standardName: 'Tuyên Quang', aliases: ['tuyên quang', 'tuyen quang'] },
  { standardName: 'Hà Giang', aliases: ['hà giang', 'ha giang', 'đồng văn'] },
  { standardName: 'Bắc Kạn', aliases: ['bắc kạn', 'bac kan'] },
  { standardName: 'Cao Bằng', aliases: ['cao bằng', 'cao bang'] },
  { standardName: 'Lạng Sơn', aliases: ['lạng sơn', 'lang son', 'đồng đăng'] },
];

// District Administrative Centers (Quận/Huyện và Thị trấn/Phường trung tâm hành chính)
// When user says a district without ward (e.g. "Thủy Nguyên", "Gia Lâm", "Bình Chánh"),
// we reverse geocode to its administrative center with hasWardCommune: true.
export interface DistrictCenter {
  name: string;
  province: string;
  centerWard: string;
  aliases: string[];
}

export const VN_DISTRICTS: DistrictCenter[] = [
  // Hải Phòng
  { name: 'Huyện Thủy Nguyên', province: 'Hải Phòng', centerWard: 'Thị trấn Núi Đèo', aliases: ['thủy nguyên', 'thuy nguyen', 'núi đèo', 'nui deo', 'thủy đường', 'lưu kiếm'] },
  { name: 'Huyện An Dương', province: 'Hải Phòng', centerWard: 'Thị trấn An Dương', aliases: ['an dương', 'an duong', 'an đồng', 'an dong', 'lê thiện', 'nam sơn'] },
  { name: 'Quận Lê Chân', province: 'Hải Phòng', centerWard: 'Phường Trại Cau', aliases: ['lê chân', 'le chan', 'vĩnh niệm', 'kênh dương', 'dư hàng'] },
  { name: 'Quận Ngô Quyền', province: 'Hải Phòng', centerWard: 'Phường Máy Tơ', aliases: ['ngô quyền', 'ngo quyen', 'lạch tray', 'cầu đất', 'đằng giang'] },
  { name: 'Quận Hồng Bàng', province: 'Hải Phòng', centerWard: 'Phường Hoàng Văn Thụ', aliases: ['hồng bàng', 'hong bang', 'thượng lý', 'hạ lý', 'quán toan'] },
  { name: 'Quận Hải An', province: 'Hải Phòng', centerWard: 'Phường Đằng Hải', aliases: ['hải an', 'hai an', 'đằng hải', 'đông hải', 'thành tô', 'cát bi'] },
  { name: 'Quận Kiến An', province: 'Hải Phòng', centerWard: 'Phường Trần Thành Ngọ', aliases: ['kiến an', 'kien an', 'trần thành ngọ', 'phù liễn'] },
  { name: 'Quận Đồ Sơn', province: 'Hải Phòng', centerWard: 'Phường Vạn Hương', aliases: ['đồ sơn', 'do son', 'vạn hương', 'ngọc xuyên'] },
  { name: 'Quận Dương Kinh', province: 'Hải Phòng', centerWard: 'Phường Anh Dũng', aliases: ['dương kinh', 'duong kinh', 'anh dũng', 'hải thành'] },
  { name: 'Huyện Tiên Lãng', province: 'Hải Phòng', centerWard: 'Thị trấn Tiên Lãng', aliases: ['tiên lãng', 'tien lang'] },
  { name: 'Huyện Vĩnh Bảo', province: 'Hải Phòng', centerWard: 'Thị trấn Vĩnh Bảo', aliases: ['vĩnh bảo', 'vinh bao'] },
  { name: 'Huyện Kiến Thụy', province: 'Hải Phòng', centerWard: 'Thị trấn Núi Đối', aliases: ['kiến thụy', 'kien thuy', 'núi đối'] },
  { name: 'Huyện Cát Hải', province: 'Hải Phòng', centerWard: 'Thị trấn Cát Bà', aliases: ['cát hải', 'cat hai', 'cát bà', 'cat ba'] },

  // Quảng Ninh
  { name: 'Thành phố Hạ Long', province: 'Quảng Ninh', centerWard: 'Phường Hồng Gai', aliases: ['hạ long', 'ha long', 'bãi cháy', 'bai chay', 'hòn gai', 'hon gai', 'hồng gai', 'tuần châu', 'cao xanh', 'cao thắng', 'hà lầm', 'hà khẩu', 'giếng đáy', 'hùng thắng'] },
  { name: 'Thành phố Cẩm Phả', province: 'Quảng Ninh', centerWard: 'Phường Cẩm Trung', aliases: ['cẩm phả', 'cam pha', 'cửa ông', 'cẩm trung', 'cẩm thịnh'] },
  { name: 'Thành phố Uông Bí', province: 'Quảng Ninh', centerWard: 'Phường Quang Trung', aliases: ['uông bí', 'uong bi', 'yên tử', 'quang trung'] },
  { name: 'Thành phố Móng Cái', province: 'Quảng Ninh', centerWard: 'Phường Trần Phú', aliases: ['móng cái', 'mong cai', 'trà cổ', 'ka long'] },
  { name: 'Thị xã Quảng Yên', province: 'Quảng Ninh', centerWard: 'Phường Quảng Yên', aliases: ['quảng yên', 'quang yen'] },
  { name: 'Thị xã Đông Triều', province: 'Quảng Ninh', centerWard: 'Phường Đông Triều', aliases: ['đông triều', 'dong trieu', 'mạo khê'] },
  { name: 'Huyện Vân Đồn', province: 'Quảng Ninh', centerWard: 'Thị trấn Cái Rồng', aliases: ['vân đồn', 'van don', 'cái rồng', 'quan lạn'] },

  // Hà Nội
  { name: 'Quận Cầu Giấy', province: 'Hà Nội', centerWard: 'Phường Quan Hoa', aliases: ['cầu giấy', 'cau giay', 'cg', 'dịch vọng', 'dịch vọng hậu', 'nghĩa tân', 'nghĩa đô', 'mai dịch', 'trung hòa', 'yên hòa'] },
  { name: 'Quận Hoàn Kiếm', province: 'Hà Nội', centerWard: 'Phường Hàng Trống', aliases: ['hoàn kiếm', 'hoan kiem', 'hk', 'hàng bạc', 'hàng bài', 'hàng bông', 'hàng gai', 'tràng tiền', 'cửa nam', 'phố cổ'] },
  { name: 'Quận Ba Đình', province: 'Hà Nội', centerWard: 'Phường Kim Mã', aliases: ['ba đình', 'ba dinh', 'liễu giai', 'cống vị', 'ngọc hà', 'giảng võ', 'kim mã', 'đội cấn'] },
  { name: 'Quận Đống Đa', province: 'Hà Nội', centerWard: 'Phường Ô Chợ Dừa', aliases: ['đống đa', 'dong da', 'láng thượng', 'láng hạ', 'quang trung', 'nam đồng', 'ô chợ dừa', 'chùa láng', 'xã đàn', 'thái hà'] },
  { name: 'Quận Hai Bà Trưng', province: 'Hà Nội', centerWard: 'Phường Lê Đại Hành', aliases: ['hai bà trưng', 'hai ba trung', 'hbt', 'bách khoa', 'đồng tâm', 'bạch đằng', 'vĩnh tuy', 'phố huế', 'bạch mai'] },
  { name: 'Quận Thanh Xuân', province: 'Hà Nội', centerWard: 'Phường Thanh Xuân Bắc', aliases: ['thanh xuân', 'thanh xuan', 'tx', 'thượng đình', 'nhân chính', 'khương trung', 'khương đình', 'khương mai', 'nguyễn trãi', 'khuất duy tiến'] },
  { name: 'Quận Tây Hồ', province: 'Hà Nội', centerWard: 'Phường Xuân La', aliases: ['tây hồ', 'tay ho', 'xuân la', 'phú thượng', 'quảng an', 'nhật tân', 'võ chí công', 'lạc long quân'] },
  { name: 'Quận Long Biên', province: 'Hà Nội', centerWard: 'Phường Bồ Đề', aliases: ['long biên', 'long bien', 'bồ đề', 'gia thụy', 'ngọc lâm', 'việt hưng', 'nguyễn văn cừ', 'cổ linh'] },
  { name: 'Quận Nam Từ Liêm', province: 'Hà Nội', centerWard: 'Phường Mễ Trì', aliases: ['nam từ liêm', 'nam tu liem', 'mễ trì', 'mỹ đình', 'mỹ đình 1', 'mỹ đình 2', 'tây mỗ', 'đại mỗ', 'phú đô', 'trung văn'] },
  { name: 'Quận Bắc Từ Liêm', province: 'Hà Nội', centerWard: 'Phường Minh Khai', aliases: ['bắc từ liêm', 'bac tu liem', 'xuân tảo', 'phúc diễn', 'cổ nhuế', 'đông ngạc'] },
  { name: 'Quận Hoàng Mai', province: 'Hà Nội', centerWard: 'Phường Hoàng Liệt', aliases: ['hoàng mai', 'hoang mai', 'linh đàm', 'hoàng liệt', 'định công', 'giáp bát', 'mai động', 'tân mai'] },
  { name: 'Quận Hà Đông', province: 'Hà Nội', centerWard: 'Phường Quang Trung', aliases: ['hà đông', 'ha dong', 'mộ lao', 'vạn phúc', 'dương nội', 'yết kiêu', 'văn quán', 'la khê'] },
  { name: 'Huyện Gia Lâm', province: 'Hà Nội', centerWard: 'Thị trấn Trâu Quỳ', aliases: ['gia lâm', 'gia lam', 'trâu quỳ', 'đa tốn', 'bát tràng', 'ninh hiệp'] },
  { name: 'Huyện Đông Anh', province: 'Hà Nội', centerWard: 'Thị trấn Đông Anh', aliases: ['đông anh', 'dong anh', 'vĩnh ngọc', 'hải bối', 'kim chung'] },
  { name: 'Huyện Sóc Sơn', province: 'Hà Nội', centerWard: 'Thị trấn Sóc Sơn', aliases: ['sóc sơn', 'soc son', 'nội bài'] },
  { name: 'Huyện Thanh Trì', province: 'Hà Nội', centerWard: 'Thị trấn Văn Điển', aliases: ['thanh trì', 'thanh tri', 'văn điển', 'tam hiệp'] },
  { name: 'Huyện Hoài Đức', province: 'Hà Nội', centerWard: 'Thị trấn Trạm Trôi', aliases: ['hoài đức', 'hoai duc', 'trạm trôi', 'an khánh'] },
  { name: 'Huyện Đan Phượng', province: 'Hà Nội', centerWard: 'Thị trấn Phùng', aliases: ['đan phượng', 'dan phuong', 'phùng', 'tân hội'] },
  { name: 'Thị xã Sơn Tây', province: 'Hà Nội', centerWard: 'Phường Lê Lợi', aliases: ['sơn tây', 'son tay'] },

  // TP. Hồ Chí Minh
  { name: 'Quận 1', province: 'TP. Hồ Chí Minh', centerWard: 'Phường Bến Nghé', aliases: ['quận 1', 'quan 1', 'q1', 'bến nghé', 'bến thành', 'nguyễn huệ', 'bùi viện', 'tân định', 'đa kao', 'phạm ngũ lão'] },
  { name: 'Quận 3', province: 'TP. Hồ Chí Minh', centerWard: 'Phường Võ Thị Sáu', aliases: ['quận 3', 'quan 3', 'q3', 'võ thị sáu'] },
  { name: 'Quận 4', province: 'TP. Hồ Chí Minh', centerWard: 'Phường 13', aliases: ['quận 4', 'quan 4', 'q4', 'khánh hội'] },
  { name: 'Quận 5', province: 'TP. Hồ Chí Minh', centerWard: 'Phường 11', aliases: ['quận 5', 'quan 5', 'q5', 'chợ lớn', 'chợ rẫy', 'chợ an đông', 'chợ kim biên'] },
  { name: 'Quận 6', province: 'TP. Hồ Chí Minh', centerWard: 'Phường 1', aliases: ['quận 6', 'quan 6', 'q6', 'bình tây'] },
  { name: 'Quận 7', province: 'TP. Hồ Chí Minh', centerWard: 'Phường Tân Phú', aliases: ['quận 7', 'quan 7', 'q7', 'phú mỹ hưng', 'tân phong', 'tân thuận'] },
  { name: 'Quận 8', province: 'TP. Hồ Chí Minh', centerWard: 'Phường 5', aliases: ['quận 8', 'quan 8', 'q8'] },
  { name: 'Quận 10', province: 'TP. Hồ Chí Minh', centerWard: 'Phường 14', aliases: ['quận 10', 'quan 10', 'q10', 'sư vạn hạnh', 'vạn hạnh mall'] },
  { name: 'Quận 11', province: 'TP. Hồ Chí Minh', centerWard: 'Phường 9', aliases: ['quận 11', 'quan 11', 'q11', 'đầm sen'] },
  { name: 'Quận 12', province: 'TP. Hồ Chí Minh', centerWard: 'Phường Thạnh Lộc', aliases: ['quận 12', 'quan 12', 'q12', 'trung mỹ tây', 'an sương'] },
  { name: 'Quận Bình Thạnh', province: 'TP. Hồ Chí Minh', centerWard: 'Phường 14', aliases: ['bình thạnh', 'binh thanh', 'phường 22', 'landmark 81', 'bến xe miền đông', 'bà chiểu', 'thanh đa'] },
  { name: 'Quận Tân Bình', province: 'TP. Hồ Chí Minh', centerWard: 'Phường 4', aliases: ['tân bình', 'tan binh', 'tân sơn nhất', 'chợ tân bình'] },
  { name: 'Quận Tân Phú', province: 'TP. Hồ Chí Minh', centerWard: 'Phường Phú Thạnh', aliases: ['tân phú', 'tan phu', 'sơn kỳ', 'aeon tân phú'] },
  { name: 'Quận Phú Nhuận', province: 'TP. Hồ Chí Minh', centerWard: 'Phường 11', aliases: ['phú nhuận', 'phu nhuan', 'phan xích long'] },
  { name: 'Quận Gò Vấp', province: 'TP. Hồ Chí Minh', centerWard: 'Phường 10', aliases: ['gò vấp', 'go vap', 'quang trung gv'] },
  { name: 'Quận Bình Tân', province: 'TP. Hồ Chí Minh', centerWard: 'Phường An Lạc', aliases: ['bình tân', 'binh tan', 'an lạc', 'bình trị đông', 'bến xe miền tây', 'aeon bình tân'] },
  { name: 'Thành phố Thủ Đức', province: 'TP. Hồ Chí Minh', centerWard: 'Phường Bình Thọ', aliases: ['thủ đức', 'thu duc', 'tp thủ đức', 'hiệp bình chánh', 'long bình', 'an lợi đông', 'thảo điền', 'kđt sala', 'vinhomes grand park'] },
  { name: 'Huyện Bình Chánh', province: 'TP. Hồ Chí Minh', centerWard: 'Thị trấn Tân Túc', aliases: ['bình chánh', 'binh chanh', 'tân túc'] },
  { name: 'Huyện Hóc Môn', province: 'TP. Hồ Chí Minh', centerWard: 'Thị trấn Hóc Môn', aliases: ['hóc môn', 'hoc mon', 'bà điểm'] },
  { name: 'Huyện Củ Chi', province: 'TP. Hồ Chí Minh', centerWard: 'Thị trấn Củ Chi', aliases: ['củ chi', 'cu chi'] },
  { name: 'Huyện Nhà Bè', province: 'TP. Hồ Chí Minh', centerWard: 'Thị trấn Nhà Bè', aliases: ['nhà bè', 'nha be', 'hiệp phước'] },
  { name: 'Huyện Cần Giờ', province: 'TP. Hồ Chí Minh', centerWard: 'Thị trấn Cần Thạnh', aliases: ['cần giờ', 'can gio', 'cần thạnh'] },

  // Đà Nẵng
  { name: 'Quận Hải Châu', province: 'Đà Nẵng', centerWard: 'Phường Hải Châu 1', aliases: ['hải châu', 'hai chau', 'hải châu 1', 'hải châu 2', 'hòa cường', 'bạch đằng đn', 'cầu rồng'] },
  { name: 'Quận Thanh Khê', province: 'Đà Nẵng', centerWard: 'Phường Vĩnh Trung', aliases: ['thanh khê', 'thanh khe'] },
  { name: 'Quận Sơn Trà', province: 'Đà Nẵng', centerWard: 'Phường An Hải Bắc', aliases: ['sơn trà', 'son tra', 'mỹ khê', 'an hải bắc', 'bán đảo sơn trà'] },
  { name: 'Quận Ngũ Hành Sơn', province: 'Đà Nẵng', centerWard: 'Phường Khuê Mỹ', aliases: ['ngũ hành sơn', 'ngu hanh son', 'mỹ an'] },
  { name: 'Quận Liên Chiểu', province: 'Đà Nẵng', centerWard: 'Phường Hòa Khánh Bắc', aliases: ['liên chiểu', 'lien chieu', 'hòa khánh'] },
  { name: 'Quận Cẩm Lệ', province: 'Đà Nẵng', centerWard: 'Phường Khuê Trung', aliases: ['cẩm lệ', 'cam le'] },
  { name: 'Huyện Hòa Vang', province: 'Đà Nẵng', centerWard: 'Xã Hòa Phong', aliases: ['hòa vang', 'hoa vang', 'bà nà'] },

  // Hưng Yên & Bắc Ninh & Hải Dương
  { name: 'Huyện Văn Giang', province: 'Hưng Yên', centerWard: 'Thị trấn Văn Giang', aliases: ['văn giang', 'van giang', 'ecopark', 'xuân quan', 'phụng công'] },
  { name: 'Huyện Văn Lâm', province: 'Hưng Yên', centerWard: 'Thị trấn Như Quỳnh', aliases: ['văn lâm', 'van lam', 'như quỳnh'] },
  { name: 'Huyện Yên Mỹ', province: 'Hưng Yên', centerWard: 'Thị trấn Yên Mỹ', aliases: ['yên mỹ', 'yen my', 'nghĩa trụ', 'vinhomes ocean park 2'] },
  { name: 'Thành phố Bắc Ninh', province: 'Bắc Ninh', centerWard: 'Phường Tiền An', aliases: ['tp bắc ninh', 'bắc ninh', 'bac ninh', 'tiền an', 'suối hoa', 'võ cường', 'vân dương'] },
  { name: 'Thành phố Từ Sơn', province: 'Bắc Ninh', centerWard: 'Phường Đông Ngàn', aliases: ['từ sơn', 'tu son', 'đông ngàn', 'đình bảng'] },
  { name: 'Huyện Quế Võ', province: 'Bắc Ninh', centerWard: 'Phường Phố Mới', aliases: ['quế võ', 'que vo', 'phố mới'] },
  { name: 'Huyện Yên Phong', province: 'Bắc Ninh', centerWard: 'Thị trấn Chờ', aliases: ['yên phong', 'yen phong', 'samsung bắc ninh'] },
  { name: 'Thành phố Hải Dương', province: 'Hải Dương', centerWard: 'Phường Trần Phú', aliases: ['hải dương', 'hai duong', 'trần phú hd'] },

  // Bình Dương & Đồng Nai
  { name: 'Thành phố Thủ Dầu Một', province: 'Bình Dương', centerWard: 'Phường Phú Cường', aliases: ['thủ dầu một', 'thu dau mot'] },
  { name: 'Thành phố Thuận An', province: 'Bình Dương', centerWard: 'Phường Lái Thiêu', aliases: ['thuận an', 'thuan an', 'lái thiêu', 'vsip 1'] },
  { name: 'Thành phố Dĩ An', province: 'Bình Dương', centerWard: 'Phường Dĩ An', aliases: ['dĩ an', 'di an', 'sóng thần'] },
  { name: 'Thành phố Biên Hòa', province: 'Đồng Nai', centerWard: 'Phường Trung Dũng', aliases: ['biên hòa', 'bien hoa'] },
  { name: 'Huyện Long Thành', province: 'Đồng Nai', centerWard: 'Thị trấn Long Thành', aliases: ['long thành', 'long thanh', 'sân bay long thành'] },
  { name: 'Huyện Nhơn Trạch', province: 'Đồng Nai', centerWard: 'Thị trấn Hiệp Phước', aliases: ['nhơn trạch', 'nhon trach'] },
  { name: 'Thành phố Vũng Tàu', province: 'Bà Rịa - Vũng Tàu', centerWard: 'Phường 1', aliases: ['vũng tàu', 'vung tau', 'bãi trước', 'bãi sau'] },
  { name: 'Thành phố Cần Thơ', province: 'Cần Thơ', centerWard: 'Phường Tân An', aliases: ['ninh kiều', 'cái răng', 'bình thủy'] },

  // Thái Nguyên
  { name: 'Thành phố Phổ Yên', province: 'Thái Nguyên', centerWard: 'Phường Ba Hàng', aliases: ['phổ yên', 'pho yen', 'tp phổ yên', 'thị xã phổ yên', 'ba hàng', 'bãi bông', 'đồng tiến', 'nam tiến', 'đắc sơn', 'samsung thái nguyên', 'kcn yên bình'] },
  { name: 'Thành phố Thái Nguyên', province: 'Thái Nguyên', centerWard: 'Phường Phan Đình Phùng', aliases: ['tp thái nguyên', 'thái nguyên', 'thai nguyen', 'phan đình phùng tn', 'quang trung tn', 'tân lập', 'gang thép'] },
  { name: 'Thành phố Sông Công', province: 'Thái Nguyên', centerWard: 'Phường Thắng Lợi', aliases: ['sông công', 'song cong', 'tp sông công'] },
  { name: 'Huyện Đại Từ', province: 'Thái Nguyên', centerWard: 'Thị trấn Hùng Sơn', aliases: ['đại từ', 'dai tu', 'hùng sơn'] },
  { name: 'Huyện Phú Bình', province: 'Thái Nguyên', centerWard: 'Thị trấn Hương Sơn', aliases: ['phú bình', 'phu binh'] },

  // Vĩnh Phúc & Phú Thọ & Bắc Giang
  { name: 'Thành phố Vĩnh Yên', province: 'Vĩnh Phúc', centerWard: 'Phường Ngô Quyền', aliases: ['vĩnh yên', 'vinh yen', 'ngô quyền vy'] },
  { name: 'Thành phố Phúc Yên', province: 'Vĩnh Phúc', centerWard: 'Phường Trưng Trắc', aliases: ['phúc yên', 'phuc yen', 'honda vĩnh phúc', 'toyota vĩnh phúc'] },
  { name: 'Thành phố Việt Trì', province: 'Phú Thọ', centerWard: 'Phường Tiên Cát', aliases: ['việt trì', 'viet tri', 'đền hùng'] },
  { name: 'Thành phố Bắc Giang', province: 'Bắc Giang', centerWard: 'Phường Ngô Quyền', aliases: ['bắc giang', 'bac giang', 'tp bắc giang', 'dĩnh kế'] },
  { name: 'Huyện Việt Yên', province: 'Bắc Giang', centerWard: 'Thị trấn Bích Động', aliases: ['việt yên', 'viet yen', 'bích động', 'kcn đình trám', 'kcn quang châu'] },

  // Hải Dương, Nam Định, Thái Bình, Hà Nam, Ninh Bình
  { name: 'Thành phố Nam Định', province: 'Nam Định', centerWard: 'Phường Vị Hoàng', aliases: ['nam định', 'nam dinh', 'tp nam định'] },
  { name: 'Thành phố Thái Bình', province: 'Thái Bình', centerWard: 'Phường Lê Hồng Phong', aliases: ['thái bình', 'thai binh', 'tp thái bình'] },
  { name: 'Thành phố Phủ Lý', province: 'Hà Nam', centerWard: 'Phường Lương Khánh Thiện', aliases: ['phủ lý', 'phu ly', 'hà nam', 'ha nam'] },
  { name: 'Thành phố Ninh Bình', province: 'Ninh Bình', centerWard: 'Phường Đông Thành', aliases: ['ninh bình', 'ninh binh', 'tp ninh bình', 'tràng an', 'bái đính'] },

  // Miền Trung & Miền Nam trọng điểm
  { name: 'Thành phố Huế', province: 'Thừa Thiên Huế', centerWard: 'Phường Phú Nhuận', aliases: ['huế', 'hue', 'tp huế'] },
  { name: 'Thành phố Nha Trang', province: 'Khánh Hòa', centerWard: 'Phường Lộc Thọ', aliases: ['nha trang', 'tp nha trang'] },
  { name: 'Thành phố Buôn Ma Thuột', province: 'Đắk Lắk', centerWard: 'Phường Thắng Lợi', aliases: ['buôn ma thuột', 'buon ma thuot', 'bmt'] },
  { name: 'Thành phố Đà Lạt', province: 'Lâm Đồng', centerWard: 'Phường 1', aliases: ['đà lạt', 'da lat', 'tp đà lạt'] },
];

// Coordinate bounding boxes for reverse geocoding GPS coordinates (Lat, Lng) to standard addresses
export interface GeoCoordinateArea {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  address: string;
  ward: string;
  district: string;
  province: string;
}

export const GEO_COORDINATE_AREAS: GeoCoordinateArea[] = [
  // Khu đô thị PG An Đồng Hải Phòng (~20.854 N, 106.657 E)
  {
    minLat: 20.845,
    maxLat: 20.862,
    minLng: 106.645,
    maxLng: 106.668,
    address: 'Khu đô thị PG An Đồng, Xã An Đồng, Huyện An Dương, Hải Phòng',
    ward: 'Xã An Đồng',
    district: 'Huyện An Dương',
    province: 'Hải Phòng',
  },
  // Thủy Nguyên - Thị trấn Núi Đèo (~20.923 N, 106.678 E)
  {
    minLat: 20.890,
    maxLat: 20.960,
    minLng: 106.640,
    maxLng: 106.720,
    address: 'Khu vực Thị trấn Núi Đèo, Huyện Thủy Nguyên, Hải Phòng',
    ward: 'Thị trấn Núi Đèo',
    district: 'Huyện Thủy Nguyên',
    province: 'Hải Phòng',
  },
  // Bãi Cháy Hạ Long (~20.958 N, 107.035 E)
  {
    minLat: 20.930,
    maxLat: 20.980,
    minLng: 107.010,
    maxLng: 107.070,
    address: 'Khu vực Bãi Cháy, Phường Bãi Cháy, Thành phố Hạ Long, Quảng Ninh',
    ward: 'Phường Bãi Cháy',
    district: 'Thành phố Hạ Long',
    province: 'Quảng Ninh',
  },
  // Hòn Gai Hạ Long (~20.950 N, 107.085 E)
  {
    minLat: 20.930,
    maxLat: 20.970,
    minLng: 107.070,
    maxLng: 107.120,
    address: 'Khu vực Hòn Gai, Phường Hồng Gai, Thành phố Hạ Long, Quảng Ninh',
    ward: 'Phường Hồng Gai',
    district: 'Thành phố Hạ Long',
    province: 'Quảng Ninh',
  },
  // Tuần Châu (~20.925 N, 106.995 E)
  {
    minLat: 20.900,
    maxLat: 20.945,
    minLng: 106.970,
    maxLng: 107.020,
    address: 'Khu du lịch Tuần Châu, Phường Tuần Châu, Thành phố Hạ Long, Quảng Ninh',
    ward: 'Phường Tuần Châu',
    district: 'Thành phố Hạ Long',
    province: 'Quảng Ninh',
  },
  // Keangnam Landmark 72 (~21.017 N, 105.784 E)
  {
    minLat: 21.012,
    maxLat: 21.022,
    minLng: 105.779,
    maxLng: 105.790,
    address: 'Tòa nhà Keangnam Landmark 72, Đường Phạm Hùng, Phường Mễ Trì, Quận Nam Từ Liêm, Hà Nội',
    ward: 'Phường Mễ Trì',
    district: 'Quận Nam Từ Liêm',
    province: 'Hà Nội',
  },
  // Landmark 81 HCM (~10.795 N, 106.722 E)
  {
    minLat: 10.790,
    maxLat: 10.800,
    minLng: 106.717,
    maxLng: 106.727,
    address: 'Tòa nhà Landmark 81, Vinhomes Central Park, Phường 22, Quận Bình Thạnh, TP. Hồ Chí Minh',
    ward: 'Phường 22',
    district: 'Quận Bình Thạnh',
    province: 'TP. Hồ Chí Minh',
  },
  // Chợ Bến Thành (~10.772 N, 106.698 E)
  {
    minLat: 10.768,
    maxLat: 10.776,
    minLng: 106.694,
    maxLng: 106.702,
    address: 'Chợ Bến Thành, Phường Bến Thành, Quận 1, TP. Hồ Chí Minh',
    ward: 'Phường Bến Thành',
    district: 'Quận 1',
    province: 'TP. Hồ Chí Minh',
  },
  // Cầu Rồng Đà Nẵng (~16.061 N, 108.227 E)
  {
    minLat: 16.055,
    maxLat: 16.066,
    minLng: 108.220,
    maxLng: 108.235,
    address: 'Khu vực Cầu Rồng, Phường Phước Ninh, Quận Hải Châu, Đà Nẵng',
    ward: 'Phường Phước Ninh',
    district: 'Quận Hải Châu',
    province: 'Đà Nẵng',
  },
];

// Parse Google Maps URLs, Pins, and Coordinates into standard textual addresses
export function parseGoogleMapsLocation(input: string): { address: string; hasWardCommune: boolean } | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();

  // 1. Coordinates match (e.g., 20.8542, 106.6578 or @20.8542,106.6578 or q=20.8542,106.6578)
  const coordMatch =
    trimmed.match(/(?:@|q=|loc:)?(-?\d{1,2}\.\d{3,8})[,\s]+(-?\d{1,3}\.\d{3,8})/i) ||
    trimmed.match(/\b(\d{1,2}\.\d{3,8})\s*,\s*(\d{1,3}\.\d{3,8})\b/);

  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lng = parseFloat(coordMatch[2]);
    if (!isNaN(lat) && !isNaN(lng)) {
      for (const area of GEO_COORDINATE_AREAS) {
        if (lat >= area.minLat && lat <= area.maxLat && lng >= area.minLng && lng <= area.maxLng) {
          return {
            address: area.address,
            hasWardCommune: true,
          };
        }
      }
    }
  }

  // 2. Google Maps URL with place name in URL path or query
  // e.g. https://www.google.com/maps/place/Khu+%C4%91%C3%B4+th%E1%BB%8B+PG+An+%C4%90%E1%BB%93ng/@20.85...
  // e.g. https://maps.google.com/?q=Landmark+72
  if (/maps\.google|google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(trimmed)) {
    // Extract place title from URL path /place/<place_name>/
    const placeMatch = trimmed.match(/\/place\/([^/@?]+)/i);
    if (placeMatch && placeMatch[1]) {
      try {
        const decoded = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).trim();
        if (decoded && decoded.length > 2) {
          const resolved = resolveAdministrativeAddress(decoded);
          if (resolved.hasWardCommune) {
            return { address: resolved.fullAddress, hasWardCommune: true };
          }
          return { address: decoded, hasWardCommune: false };
        }
      } catch {}
    }

    // Extract query parameter q=...
    const qMatch = trimmed.match(/[?&]q=([^&]+)/i);
    if (qMatch && qMatch[1]) {
      try {
        const decoded = decodeURIComponent(qMatch[1].replace(/\+/g, ' ')).trim();
        if (decoded && !/^-?\d/.test(decoded)) {
          const resolved = resolveAdministrativeAddress(decoded);
          if (resolved.hasWardCommune) {
            return { address: resolved.fullAddress, hasWardCommune: true };
          }
          return { address: decoded, hasWardCommune: false };
        }
      } catch {}
    }
  }

  return null;
}

// Comprehensive resolution using Vietnam's 63 provinces, all districts and wards
export function resolveAdministrativeAddress(rawInput: string): {
  fullAddress: string;
  hasWardCommune: boolean;
  province?: string;
  district?: string;
  ward?: string;
} {
  if (!rawInput || typeof rawInput !== 'string') {
    return { fullAddress: '', hasWardCommune: false };
  }

  const clean = rawInput.trim();
  const unaccented = removeVietnameseDiacritics(clean);

  // 1. Check if it is a Google Maps location (URL or GPS coordinate)
  const gmap = parseGoogleMapsLocation(clean);
  if (gmap) {
    return {
      fullAddress: gmap.address,
      hasWardCommune: gmap.hasWardCommune,
    };
  }

  // 2. Preserve house numbers or landmark prefixes (e.g. "Khu đô thị PG An Đồng", "Số 120", "P. 502 Keangnam")
  const numMatch =
    clean.match(/(?:số\s+|phòng\s+|căn\s+|tầng\s+)(\d+[a-zA-Z]?(?:\/\d+)*)\b/i) ||
    clean.match(/^(\d+[a-zA-Z]?(?:\/\d+)*)\s+/i);
  const prefixNum = numMatch ? `${numMatch[0].trim()} ` : '';

  // 3. Match against Vietnam District Directory & Administrative Centers
  for (const d of VN_DISTRICTS) {
    for (const alias of d.aliases) {
      const aliasUnaccented = removeVietnameseDiacritics(alias);
      const pattern = new RegExp(`\\b${alias}\\b`, 'i');
      const unaccentedPattern = new RegExp(`\\b${aliasUnaccented}\\b`, 'i');

      if (pattern.test(clean) || unaccentedPattern.test(unaccented)) {
        // Formulate standard address
        let base = `${d.name}, ${d.province}`;
        if (d.centerWard) {
          base = `Khu vực ${d.centerWard}, ${d.name}, ${d.province}`;
        }

        // Special famous aliases handling
        if (/pg\s*an\s*đồng/i.test(clean) || /pg\s*an\s*dong/i.test(unaccented)) {
          return {
            fullAddress: `${prefixNum}Khu đô thị PG An Đồng, Xã An Đồng, Huyện An Dương, Hải Phòng`,
            hasWardCommune: true,
            province: 'Hải Phòng',
            district: 'Huyện An Dương',
            ward: 'Xã An Đồng',
          };
        }
        if (/bãi\s*cháy/i.test(clean) || /bai\s*chay/i.test(unaccented)) {
          return {
            fullAddress: `${prefixNum}Khu vực Bãi Cháy, Phường Bãi Cháy, Thành phố Hạ Long, Quảng Ninh`,
            hasWardCommune: true,
            province: 'Quảng Ninh',
            district: 'Thành phố Hạ Long',
            ward: 'Phường Bãi Cháy',
          };
        }
        if (/hòn\s*gai|hồng\s*gai/i.test(clean) || /hon\s*gai|hong\s*gai/i.test(unaccented)) {
          return {
            fullAddress: `${prefixNum}Khu vực Hòn Gai, Phường Hồng Gai, Thành phố Hạ Long, Quảng Ninh`,
            hasWardCommune: true,
            province: 'Quảng Ninh',
            district: 'Thành phố Hạ Long',
            ward: 'Phường Hồng Gai',
          };
        }
        if (/tuần\s*châu/i.test(clean) || /tuan\s*chau/i.test(unaccented)) {
          return {
            fullAddress: `${prefixNum}Khu du lịch Tuần Châu, Phường Tuần Châu, Thành phố Hạ Long, Quảng Ninh`,
            hasWardCommune: true,
            province: 'Quảng Ninh',
            district: 'Thành phố Hạ Long',
            ward: 'Phường Tuần Châu',
          };
        }
        if (/thủy\s*nguyên/i.test(clean) || /thuy\s*nguyen/i.test(unaccented)) {
          return {
            fullAddress: `${prefixNum}Khu vực Thị trấn Núi Đèo, Huyện Thủy Nguyên, Hải Phòng`,
            hasWardCommune: true,
            province: 'Hải Phòng',
            district: 'Huyện Thủy Nguyên',
            ward: 'Thị trấn Núi Đèo',
          };
        }

        return {
          fullAddress: `${prefixNum}${base}`,
          hasWardCommune: true,
          province: d.province,
          district: d.name,
          ward: d.centerWard,
        };
      }
    }
  }

  // 4. If province alone is detected (e.g. "Hà Nội", "Hải Phòng", "Quảng Ninh") without ward/district
  for (const prov of VN_PROVINCES) {
    for (const alias of prov.aliases) {
      const aliasUnaccented = removeVietnameseDiacritics(alias);
      const isExact =
        clean.toLowerCase() === alias ||
        unaccented === aliasUnaccented ||
        new RegExp(`^(?:ở|tại|tỉnh|tp|thành phố)?\\s*${alias}$`, 'i').test(clean);
      if (isExact) {
        return {
          fullAddress: prov.standardName,
          hasWardCommune: false, // Incomplete! Requires ward/commune detail
          province: prov.standardName,
        };
      }
    }
  }

  return { fullAddress: clean, hasWardCommune: false };
}
